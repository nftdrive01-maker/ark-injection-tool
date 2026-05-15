import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { verifyToken, extractToken } from '@/lib/auth';
import { getDomainById, updateDomain } from '@/lib/domains';
import { getMCPServerById } from '@/lib/mcp-servers';
import { sanitizeCrawlResult, containsLikelyChinese } from '@/lib/language-guard';
import { parseStructuredCrawlResult, renderStructuredCrawlResult } from '@/lib/crawl-structure';

interface CrawlRequest {
  url: string;
  mcpServerId: string;
  maxPages?: number;
  appendMode?: 'replace' | 'append';
}

interface MCPTextContent {
  type: string;
  text?: string;
}

function buildSystemPromptFromCrawl(rawContent: string, siteUrl: string): string {
  const structured = parseStructuredCrawlResult(rawContent);
  if (structured) {
    return renderStructuredCrawlResult(structured, siteUrl);
  }

  const lines = rawContent.split('\n').filter((l) => l.trim().length > 0);
  const pageCountLine = lines.find((l) => l.startsWith('取得ページ数:'));
  const pageCount = pageCountLine ? pageCountLine.replace('取得ページ数:', '').trim() : '不明';

  // ヘッダー生成
  const header = [
    `【サイト情報】`,
    `参照元: ${siteUrl}`,
    `取得ページ数: ${pageCount}`,
    ``,
    `以下はサイトの構造と内容を解析した結果です。この情報を元にユーザーへの案内・質問応答を行ってください。`,
    ``,
  ].join('\n');

  // ページセクション抽出（## で始まる行以降をページ情報として扱う）
  const pageSections: string[] = [];
  let currentSection: string[] = [];
  for (const line of lines) {
    if (line.startsWith('## ') && currentSection.length > 0) {
      pageSections.push(currentSection.join('\n'));
      currentSection = [line];
    } else if (line.startsWith('## ') || currentSection.length > 0) {
      currentSection.push(line);
    }
  }
  if (currentSection.length > 0) {
    pageSections.push(currentSection.join('\n'));
  }

  const body = pageSections.join('\n\n');
  return header + body;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }
    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const domainId = params.id;
    const domain = getDomainById(domainId);
    if (!domain) {
      return NextResponse.json({ error: 'ドメインが見つかりません' }, { status: 404 });
    }

    const body = (await request.json()) as CrawlRequest;
    if (!body.url || !body.url.startsWith('http')) {
      return NextResponse.json({ error: '有効なURLを指定してください' }, { status: 400 });
    }
    if (!body.mcpServerId) {
      return NextResponse.json({ error: 'mcpServerId が必要です' }, { status: 400 });
    }

    const mcpServer = getMCPServerById(body.mcpServerId);
    if (!mcpServer || !mcpServer.enabled) {
      return NextResponse.json({ error: 'MCPサーバーが見つかりません' }, { status: 404 });
    }
    if (mcpServer.transport !== 'sse' && mcpServer.transport !== 'http') {
      return NextResponse.json({ error: 'SSE/HTTP のMCPサーバーのみ対応しています' }, { status: 400 });
    }
    if (!mcpServer.config.url) {
      return NextResponse.json({ error: 'MCPサーバーのURLが未設定です' }, { status: 400 });
    }

    // Docker内部URLへの解決
    const internalBase = process.env.INJECTION_MCP_INTERNAL_BASE_URL || 'http://mcp-server:8000';
    const resolvedMcpUrl = internalBase
      ? mcpServer.config.url.replace(/^https?:\/\/localhost(:\d+)?/, internalBase)
      : mcpServer.config.url;

    // MCP接続 → crawl_site 実行
    const transport = new SSEClientTransport(new URL(resolvedMcpUrl));
    const client = new Client({ name: 'injection-tool-crawl', version: '1.0.0' });

    let crawlResult: string;
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'crawl_site',
        arguments: {
          url: body.url,
          max_pages: body.maxPages ?? 10,
        },
      });

      const content = (result.content ?? []) as MCPTextContent[];
      const textParts = content
        .filter((item) => item?.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text as string);
      crawlResult = textParts.join('\n').trim();

      if (result.isError || /^Error executing tool/i.test(crawlResult)) {
        return NextResponse.json(
          {
            error: 'サイト解析に失敗しました',
            details: crawlResult || 'crawl_site からエラーが返されました',
          },
          { status: 502 }
        );
      }

      if (!crawlResult) {
        return NextResponse.json({ error: 'クロール結果が空でした' }, { status: 502 });
      }
    } finally {
      await transport.close().catch(() => undefined);
    }

    const structured = parseStructuredCrawlResult(crawlResult);
    const { cleaned, removedChunks } = structured ? { cleaned: renderStructuredCrawlResult(structured, body.url), removedChunks: [] as string[] } : sanitizeCrawlResult(crawlResult);
    const finalCrawlResult = cleaned || crawlResult;

    // プロンプト生成
    const generatedPrompt = buildSystemPromptFromCrawl(finalCrawlResult, body.url);

    // ドメインに保存
    const appendMode = body.appendMode ?? 'replace';
    const newBaseSystemPrompt = appendMode === 'append' && domain.baseSystemPrompt.trim()
      ? `${domain.baseSystemPrompt}\n\n${generatedPrompt}`
      : generatedPrompt;

    const updated = updateDomain(domainId, {
      ...domain,
      baseSystemPrompt: newBaseSystemPrompt,
    });

    if (!updated) {
      return NextResponse.json({ error: 'ドメイン更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      domain: updated,
      generatedPrompt,
      crawlSummary: {
        url: body.url,
        pageCount: structured ? (structured.blocks?.length ?? 0) : (finalCrawlResult.match(/^## /gm) ?? []).length,
        removedChunks,
        hasChineseAfterSanitize: containsLikelyChinese(generatedPrompt),
        structured: Boolean(structured),
      },
    });
  } catch (err) {
    console.error('Crawl error:', err);
    return NextResponse.json({ error: 'サーバーエラー', details: String(err) }, { status: 500 });
  }
}
