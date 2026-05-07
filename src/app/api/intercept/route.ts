import { NextRequest, NextResponse } from 'next/server';
import { InjectionInterceptRequest, InjectionInterceptResponse } from '@/types/injection';
import { getDomainById, getKnowledgeById } from '@/lib/domains';
import { executeMCPForDomain } from '@/lib/mcp-runtime';

/**
 * 注入インターセプト API
 * Amica からのユーザー入力をキャッチして、動的な知識を注入する
 * 
 * CORS対応: Amicaからの呼び出しを許可（クロスオリジン対応）
 * fail-open: どんなエラーでも空レスポンスを返し、Amica側で素通し処理する
 */

const AMICA_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

function requiresStrictFetchFormat(userText: string): boolean {
  return /(fetch\s*mcp|参照した\s*url|取得した内容の要約|推測\s*禁止|推測\s*は\s*禁止|必ず.*fetch|出力には以下を必ず含めてください)/i.test(userText);
}

function createStrictFetchInstruction(mcpSucceeded: boolean): string {
  if (!mcpSucceeded) {
    return `
====================
【回答制約（必須）】
この質問はFetch MCP結果が必須です。MCP結果が得られなかったため、回答は次の固定文のみを返してください。
「取得できませんでした」
追加説明・推測・補足は禁止です。
`;
  }

  return `
====================
【回答制約（必須）】
以下を必ず守って回答してください。
1. 自分の知識や推測で補完しない
2. 直上のMCP実行結果だけを根拠にする
3. 出力に必ず次の2項目を含める
   - 参照したURL
   - 取得した内容の要約
4. URLが判別できない場合は「参照したURL: 取得できませんでした」と明記する
`;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': AMICA_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: NextRequest) {
  // CORS ヘッダを設定
  const corsHeaders = {
    'Access-Control-Allow-Origin': AMICA_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // リクエストボディを解析
    let body: InjectionInterceptRequest;
    try {
      body = await req.json();
    } catch {
      // JSON解析エラー → fail-open
      return NextResponse.json({} as InjectionInterceptResponse, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const { userText, domainId } = body;

    // userText が必須
    if (!userText) {
      return NextResponse.json({} as InjectionInterceptResponse, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ドメインを取得（デフォルト: 最初のドメインまたはNULL）
    const targetDomainId = domainId || process.env.INJECTION_DEFAULT_DOMAIN_ID || 'default';
    const domain = getDomainById(targetDomainId);

    if (!domain) {
      // ドメインが見つからない → fail-open
      return NextResponse.json({} as InjectionInterceptResponse, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // 見出し付き形式で system prompt を構築
    let injectedSystemPrompt = `【メインドメイン】
【システムプロンプト】
${domain.baseSystemPrompt || ''}

【ベースコンテキスト】
${domain.baseContext || ''}\n`;

    // ドメインに紐付いたナレッジを追加
    if (Array.isArray(domain.knowledgeIds) && domain.knowledgeIds.length > 0) {
      for (const knowledgeId of domain.knowledgeIds) {
        const knowledge = getKnowledgeById(knowledgeId);
        if (knowledge && knowledge.enabled) {
          injectedSystemPrompt += `\n====================
【追加ナレッジ】
【ナレッジ名】
${knowledge.name}

【ナレッジプロンプト】
${knowledge.systemPrompt || ''}

【ナレッジコンテキスト】
${knowledge.context || ''}
`;
        }
      }
    }

    const mcpResult = await executeMCPForDomain({
      mcpServerIds: domain.mcpServerIds,
      userText,
    });

    if (mcpResult?.success && mcpResult.output) {
      injectedSystemPrompt += `
====================
【MCP実行結果】
【サーバー】
${mcpResult.serverName || mcpResult.serverId || 'unknown'}

【ツール】
${mcpResult.toolName || 'unknown'}

【結果】
${mcpResult.output}
`;
    }

    const strictFetchRequired = requiresStrictFetchFormat(userText);

    if (strictFetchRequired) {
      injectedSystemPrompt += createStrictFetchInstruction(Boolean(mcpResult?.success && mcpResult.output));
    }

    injectedSystemPrompt += `
====================
【出力フォーマット】
回答は話題・内容が変わるタイミングで必ず改行（空行）を入れ、読みやすい段落構造にしてください。1つの段落は3〜5文程度を目安にしてください。
`;

    // レスポンスを構築（全体を system 側に）
    const response: InjectionInterceptResponse = {
      injectedSystemPrompt: injectedSystemPrompt,
      injectedUserContext: '', // 空（system に統合済み）
      metadata: {
        domainId: domain.id,
        ttl: domain.ttl,
        version: domain.version,
        mcpUsed: Boolean(mcpResult?.success),
        mcpServerId: mcpResult?.serverId,
        mcpToolName: mcpResult?.toolName,
        mcpError: mcpResult && !mcpResult.success ? mcpResult.error : undefined,
        strictFetchRequired,
        strictFetchInjected: strictFetchRequired,
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error('Intercept error:', err);
    // あらゆるエラー → fail-open で空レスポンス
    return NextResponse.json({} as InjectionInterceptResponse, {
      status: 200,
      headers: corsHeaders,
    });
  }
}
