import { NextRequest, NextResponse } from 'next/server';
import { InjectionInterceptRequest, InjectionInterceptResponse } from '@/types/injection';
import { getDomainById, getKnowledgeById } from '@/lib/domains';

/**
 * 注入インターセプト API
 * Amica からのユーザー入力をキャッチして、動的な知識を注入する
 * 
 * CORS対応: Amicaからの呼び出しを許可（クロスオリジン対応）
 * fail-open: どんなエラーでも空レスポンスを返し、Amica側で素通し処理する
 */

const AMICA_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

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

    // レスポンスを構築（全体を system 側に）
    const response: InjectionInterceptResponse = {
      injectedSystemPrompt: injectedSystemPrompt,
      injectedUserContext: '', // 空（system に統合済み）
      metadata: {
        domainId: domain.id,
        ttl: domain.ttl,
        version: domain.version,
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
