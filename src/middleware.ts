import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  AUTH_HEADER_PLACEHOLDER,
  SESSION_COOKIE_NAME,
  getSessionTokenFromCookieHeader,
  isAdminCredentialConfigurationSafe,
  isSameOriginRequest,
  isSecureRequest,
} from '@/lib/auth-shared';
import { verifyTokenEdge } from '@/lib/auth-edge';

function isProtectedPagePath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/help' || pathname.startsWith('/help/');
}

function isLoginPath(pathname: string): boolean {
  return pathname === '/login';
}

function isPublicApiPath(pathname: string): boolean {
  return (
    pathname === '/api/health' ||
    pathname === '/api/intercept' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/session' ||
    pathname.startsWith('/api/public/')
  );
}

function isProtectedApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/') && !isPublicApiPath(pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionToken = getSessionTokenFromCookieHeader(req.headers.get('cookie'));
  const hasValidSession = Boolean(sessionToken && await verifyTokenEdge(sessionToken));
  const hasSafeAdminConfig = isAdminCredentialConfigurationSafe();

  if ((isProtectedPagePath(pathname) || isProtectedApiPath(pathname)) && !hasSafeAdminConfig) {
    return NextResponse.json(
      { error: '管理画面の認証設定が不完全です。環境変数を設定してください。' },
      { status: 503 },
    );
  }

  if (isLoginPath(pathname) && hasValidSession) {
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  if (isProtectedPagePath(pathname) && !hasValidSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!isProtectedApiPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasValidSession) {
    return NextResponse.next();
  }

  const verifiedSessionToken = sessionToken || '';

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isSameOriginRequest(req)) {
    return NextResponse.json({ error: '不正なオリジンです' }, { status: 403 });
  }

  const requestHeaders = new Headers(req.headers);
  const currentAuthorization = requestHeaders.get('authorization');
  if (!currentAuthorization || currentAuthorization === `Bearer ${AUTH_HEADER_PLACEHOLDER}`) {
    requestHeaders.set('authorization', `Bearer ${verifiedSessionToken}`);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: verifiedSessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/help/:path*', '/login', '/api/:path*'],
};