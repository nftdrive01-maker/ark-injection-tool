import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { exportFullBackup, importFullBackup } from '@/lib/domains';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  if (!token || !verifyToken(token)) {
    return false;
  }

  return true;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const backup = exportFullBackup();
    const filename = `arki-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Export backup error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const payload = await req.json();
    const result = importFullBackup(payload);

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'バックアップ読込に失敗しました' }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Import backup error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
