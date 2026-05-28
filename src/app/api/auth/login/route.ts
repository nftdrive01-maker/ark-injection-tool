import { NextRequest, NextResponse } from 'next/server';
import { authenticate, isAdminCredentialConfigurationSafe, SESSION_COOKIE_NAME } from '@/lib/auth';
import { isSecureRequest } from '@/lib/auth-shared';
import { writeAdminLoginHistory, writeAdminLoginHistoryRecord } from '@/lib/admin-login-history';

type LoginRateLimitBucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const LOGIN_LIMIT_PER_MINUTE = 10;

const globalForLoginRateLimit = globalThis as typeof globalThis & {
  __injectionAdminLoginRateLimitStore?: Map<string, LoginRateLimitBucket>;
};

const loginRateLimitStore = globalForLoginRateLimit.__injectionAdminLoginRateLimitStore ?? new Map<string, LoginRateLimitBucket>();
globalForLoginRateLimit.__injectionAdminLoginRateLimitStore = loginRateLimitStore;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isRateLimited(ip: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = loginRateLimitStore.get(ip);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : existing;

  if (bucket.count >= LOGIN_LIMIT_PER_MINUTE) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  loginRateLimitStore.set(ip, bucket);
  return { limited: false, retryAfterSeconds: 0 };
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminCredentialConfigurationSafe()) {
      return NextResponse.json(
        { error: '管理画面の認証設定が不完全です。INJECTION_ADMIN_USERNAME / INJECTION_ADMIN_PASSWORD / INJECTION_SESSION_SECRET を設定してください。' },
        { status: 503 },
      );
    }

    const rateLimitResult = isRateLimited(getClientIp(req));
    if (rateLimitResult.limited) {
      writeAdminLoginHistoryRecord({ ip: getClientIp(req), success: false });
      return NextResponse.json(
        { error: 'ログイン試行が多すぎます。しばらく待って再試行してください。' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimitResult.retryAfterSeconds) },
        },
      );
    }

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'ユーザー名とパスワードが必須です' }, { status: 400 });
    }

    const token = authenticate(username, password);

    if (!token) {
      writeAdminLoginHistoryRecord({ ip: getClientIp(req), success: false });
      return NextResponse.json({ error: 'ユーザー名またはパスワードが正しくありません' }, { status: 401 });
    }

    writeAdminLoginHistory(getClientIp(req));

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(req),
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
