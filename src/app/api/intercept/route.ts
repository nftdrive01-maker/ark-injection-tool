import { NextRequest, NextResponse } from 'next/server';
import { type InjectionInterceptRequest, type InjectionInterceptResponse } from '@/types/injection';
import { getDomainById } from '@/lib/domains';
import {
  createDomainAccessErrorResponse,
  getDomainAccessTokenFromRequest,
  verifyDomainAccessFromToken,
} from '@/lib/domain-access-control';
import { getPublicManagementSettings } from '@/lib/public-management';
import { applyPublicRateLimit } from '@/lib/rate-limit';
import { buildInterceptResponse } from '@/lib/intercept-service';

/**
 * 注入インターセプト API
 * クライアントからのユーザー入力をキャッチして、動的な知識を注入する
 * 
 * CORS対応: クライアントからの呼び出しを許可（クロスオリジン対応）
 * fail-open: どんなエラーでも空レスポンスを返し、クライアント側で素通し処理する
 */

const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': CLIENT_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-id, x-domain-access-token',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: NextRequest) {
  // CORS ヘッダを設定
  const corsHeaders = {
    'Access-Control-Allow-Origin': CLIENT_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-user-id, x-domain-access-token',
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
    const sessionId = (body.sessionId || '').trim();
    const headerUserId = req.headers.get('x-user-id') || '';
    const userId = headerUserId.trim() || (sessionId ? `anonymous:${sessionId}` : 'anonymous:unknown-session');

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

    const accessResult = verifyDomainAccessFromToken(targetDomainId, getDomainAccessTokenFromRequest(req));
    if (!accessResult.ok) {
      return createDomainAccessErrorResponse(accessResult.reason, corsHeaders);
    }

    const rateLimitResponse = applyPublicRateLimit(
      req,
      getPublicManagementSettings(),
      'intercept',
      'chat',
      corsHeaders,
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const response = await buildInterceptResponse({
      body,
      domain,
      userId,
      sessionId,
    });

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
