import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { listDomainChatHistory } from '@/lib/domain-chat-history';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const rawDomainId = req.nextUrl.searchParams.get('domainId') || '';
    const domainId = rawDomainId.trim();
    const rawUserId = req.nextUrl.searchParams.get('userId') || '';
    const userId = rawUserId.trim();
    const rawSessionId = req.nextUrl.searchParams.get('sessionId') || '';
    const sessionId = rawSessionId.trim();
    const all = req.nextUrl.searchParams.get('all') === 'true';
    const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;

    const result = await listDomainChatHistory({
      domainId: domainId || undefined,
      userId: userId || undefined,
      sessionId: sessionId || undefined,
      limit,
      all,
    });

    return NextResponse.json(
      {
        items: result.items,
        totalCount: result.totalCount,
        limit: result.limit,
        availableUserIds: result.availableUserIds,
        availableSessionIds: result.availableSessionIds,
        domainId: domainId || null,
        userId: userId || null,
        sessionId: sessionId || null,
        all,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Get domain chat history error:', error);
    return NextResponse.json(
      { items: [], totalCount: 0, limit: 100, availableUserIds: [], availableSessionIds: [], error: 'チャット履歴の取得に失敗しました' },
      { status: 500 },
    );
  }
}
