import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { clearDomainSharedLogs, listDomainSharedLogs } from '@/lib/domain-shared-log';

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
    const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 100;

    const result = await listDomainSharedLogs({
      domainId: domainId || undefined,
      limit,
    });

    return NextResponse.json(
      {
        logs: result.logs,
        total: result.total,
        limit: result.limit,
        domainId: domainId || null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Get domain shared logs error:', error);
    return NextResponse.json(
      { logs: [], total: 0, limit: 100, error: '共有ログの取得に失敗しました' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    await clearDomainSharedLogs();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Clear domain shared logs error:', error);
    return NextResponse.json({ error: '共有ログの初期化に失敗しました' }, { status: 500 });
  }
}
