import { NextRequest, NextResponse } from 'next/server';
import {
  getDerivedGlobalChatRequestsPerMinute,
  getDerivedGlobalTtsRequestsPerMinute,
  type PublicManagementSettings,
} from '@/lib/public-management';

type PublicRateLimitKind = 'chat' | 'tts';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
};

const WINDOW_MS = 60_000;

const globalRateLimitStore = globalThis as typeof globalThis & {
  __injectionToolRateLimitStore?: Map<string, RateLimitBucket>;
  __injectionToolRateLimitCleanupCounter?: number;
};

const rateLimitStore = globalRateLimitStore.__injectionToolRateLimitStore ?? new Map<string, RateLimitBucket>();
globalRateLimitStore.__injectionToolRateLimitStore = rateLimitStore;

function cleanupExpiredBuckets(now: number): void {
  const counter = (globalRateLimitStore.__injectionToolRateLimitCleanupCounter || 0) + 1;
  globalRateLimitStore.__injectionToolRateLimitCleanupCounter = counter;

  if (counter % 100 !== 0) {
    return;
  }

  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function consumeRateLimit(storeKey: string, limit: number): RateLimitResult {
  if (!Number.isFinite(limit) || limit <= 0) {
    return {
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      retryAfterSeconds: 0,
      limit: 0,
    };
  }

  const now = Date.now();
  cleanupExpiredBuckets(now);

  const existing = rateLimitStore.get(storeKey);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : existing;

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      limit,
    };
  }

  bucket.count += 1;
  rateLimitStore.set(storeKey, bucket);

  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(0, Math.ceil((bucket.resetAt - now) / 1000)),
    limit,
  };
}

function getClientIp(req: NextRequest): string {
  const cfConnectingIp = String(req.headers.get('cf-connecting-ip') || '').trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor = String(req.headers.get('x-forwarded-for') || '').trim();
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = String(req.headers.get('x-real-ip') || '').trim();
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

function createRateLimitResponse(
  routeLabel: string,
  retryAfterSeconds: number,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    {
      error: `${routeLabel} のレート制限に達しました。しばらく待ってから再試行してください。`,
      code: 'RATE_LIMITED',
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        ...headers,
        'Retry-After': String(retryAfterSeconds),
      },
    }
  );
}

export function applyPublicRateLimit(
  req: NextRequest,
  settings: PublicManagementSettings,
  routeLabel: string,
  kind: PublicRateLimitKind,
  headers?: Record<string, string>
): NextResponse | null {
  const clientIp = getClientIp(req);
  const perUserLimit = kind === 'tts'
    ? Math.max(0, Math.floor(settings.ttsRequestsPerUserPerMinute || 0))
    : Math.max(0, Math.floor(settings.chatRequestsPerUserPerMinute || 0));
  const globalLimit = kind === 'tts'
    ? getDerivedGlobalTtsRequestsPerMinute(settings)
    : getDerivedGlobalChatRequestsPerMinute(settings);

  if (perUserLimit > 0) {
    const userResult = consumeRateLimit(`public:${kind}:user:${clientIp}`, perUserLimit);
    if (!userResult.allowed) {
      return createRateLimitResponse(routeLabel, userResult.retryAfterSeconds, headers);
    }
  }

  if (globalLimit > 0) {
    const globalResult = consumeRateLimit(`public:${kind}:global`, globalLimit);
    if (!globalResult.allowed) {
      return createRateLimitResponse(routeLabel, globalResult.retryAfterSeconds, headers);
    }
  }

  return null;
}