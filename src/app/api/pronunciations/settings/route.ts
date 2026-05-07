import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { getPronunciationSettings, updatePronunciationSettings } from '@/lib/pronunciation-settings';

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

    return NextResponse.json(getPronunciationSettings(), { status: 200 });
  } catch (err) {
    console.error('Get pronunciation settings error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const updated = updatePronunciationSettings({
      wanaKanaEnabled: body?.wanaKanaEnabled === true,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('Update pronunciation settings error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}