import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { verifyToken, extractToken } from '@/lib/auth';
import { createKnowledge, getDomainById, getKnowledgeById, updateDomain, updateKnowledge } from '@/lib/domains';
import { getMCPServerById } from '@/lib/mcp-servers';
import { sanitizeCrawlResult, containsLikelyChinese } from '@/lib/language-guard';
import { parseStructuredCrawlResult, renderStructuredCrawlResult } from '@/lib/crawl-structure';

interface KnowledgeCrawlRequest {
  url: string;
  mcpServerId: string;
  maxPages?: number;
  knowledgeName?: string;
  knowledgeDescription?: string;
  knowledgeId?: string;
  domainId?: string;
}

interface MCPTextContent {
  type: string;
  text?: string;
}

function buildKnowledgeName(url: string, customName?: string): string {
  const trimmed = (customName || '').trim();
  if (trimmed) {
    return trimmed;
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    const suffix = path.length > 0 ? ` ${path}` : '';
    return `サイト解析: ${parsed.hostname}${suffix}`;
  } catch {
    return 'サイト解析ナレッジ';
  }
}

function extractCrawlSummary(rawContent: string): { pageCountLabel: string; pageCount: number } {
  const lines = rawContent.split('\n');
  const pageCountLine = lines.find((line) => line.startsWith('取得ページ数:'));
  const pageCountLabel = pageCountLine
    ? pageCountLine.replace('取得ページ数:', '').trim()
    : '不明';
  const pageCount = (rawContent.match(/^## /gm) ?? []).length;

  return { pageCountLabel, pageCount };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const body = (await req.json()) as KnowledgeCrawlRequest;
    if (!body.url || !body.url.startsWith('http')) {
      return NextResponse.json({ error: '有効なURLを指定してください' }, { status: 400 });
    }
    if (!body.mcpServerId) {
      return NextResponse.json({ error: 'mcpServerId が必要です' }, { status: 400 });
    }

    const maxPages = typeof body.maxPages === 'number' ? Math.max(1, Math.min(30, body.maxPages)) : 10;

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

    const internalBase = process.env.INJECTION_MCP_INTERNAL_BASE_URL || 'http://mcp-server:8000';
    const resolvedMcpUrl = internalBase
      ? mcpServer.config.url.replace(/^https?:\/\/localhost(:\d+)?/, internalBase)
      : mcpServer.config.url;

    const transport = new SSEClientTransport(new URL(resolvedMcpUrl));
    const client = new Client({ name: 'injection-tool-knowledge-crawl', version: '1.0.0' });

    let crawlResult = '';
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'crawl_site',
        arguments: {
          url: body.url,
          max_pages: maxPages,
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
    const finalContext = cleaned || crawlResult;

    const name = buildKnowledgeName(body.url, body.knowledgeName);
    const requestedDescription = (body.knowledgeDescription || '').trim();

    let knowledge;
    let operation: 'created' | 'updated' = 'created';
    if (body.knowledgeId) {
      const existing = getKnowledgeById(body.knowledgeId);
      if (!existing) {
        return NextResponse.json({ error: '更新対象ナレッジが見つかりません' }, { status: 404 });
      }

      const updated = updateKnowledge(existing.id, {
        name,
        description: requestedDescription || existing.description,
        context: finalContext,
      });

      if (!updated) {
        return NextResponse.json({ error: 'ナレッジ更新に失敗しました' }, { status: 500 });
      }

      knowledge = updated;
      operation = 'updated';
    } else {
      const description = requestedDescription || `サイト解析から生成: ${body.url}`;
      knowledge = createKnowledge({
        name,
        description,
        systemPrompt: '',
        context: finalContext,
        enabled: true,
        priority: 100,
      });
    }

    let updatedDomain = null;
    if (body.domainId) {
      const domain = getDomainById(body.domainId);
      if (!domain) {
        return NextResponse.json({ error: 'アタッチ先ドメインが見つかりません' }, { status: 404 });
      }

      const nextKnowledgeIds = domain.knowledgeIds.includes(knowledge.id)
        ? domain.knowledgeIds
        : [...domain.knowledgeIds, knowledge.id];

      updatedDomain = updateDomain(domain.id, {
        knowledgeIds: nextKnowledgeIds,
      });

      if (!updatedDomain) {
        return NextResponse.json({ error: 'ドメインへのナレッジアタッチに失敗しました' }, { status: 500 });
      }
    }

    const summary = extractCrawlSummary(finalContext);

    return NextResponse.json({
      success: true,
      operation,
      knowledge,
      domain: updatedDomain,
      crawlSummary: {
        url: body.url,
        pageCountLabel: summary.pageCountLabel,
        pageCount: structured ? (structured.blocks?.length ?? 0) : summary.pageCount,
        removedChunks,
        hasChineseAfterSanitize: containsLikelyChinese(finalContext),
        structured: Boolean(structured),
      },
    });
  } catch (err) {
    console.error('Knowledge crawl error:', err);
    return NextResponse.json({ error: 'サーバーエラー', details: String(err) }, { status: 500 });
  }
}
