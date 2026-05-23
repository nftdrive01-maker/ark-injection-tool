import { NextRequest, NextResponse } from 'next/server';
import {
  createDomainAccessErrorResponse,
  issueDomainTokenForUser,
  verifyDomainUserCredentials,
} from '@/lib/domain-access-control';

const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CLIENT_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-domain-access-token',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const domainId = String(body?.domainId || '').trim();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!domainId || !username || !password) {
      return NextResponse.json(
        { error: 'domainId, username, password は必須です', code: 'INVALID_CREDENTIALS' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const result = verifyDomainUserCredentials(domainId, username, password);
    if (!result.ok) {
      return createDomainAccessErrorResponse(result.reason, CORS_HEADERS);
    }

    return NextResponse.json(
      {
        ok: true,
        domainId,
        username: result.username || username,
        accessToken: issueDomainTokenForUser(domainId, result.username || username),
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error('Domain access login error:', error);
    return NextResponse.json(
      { error: 'ドメイン認証に失敗しました', code: 'DOMAIN_AUTH_ERROR' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}