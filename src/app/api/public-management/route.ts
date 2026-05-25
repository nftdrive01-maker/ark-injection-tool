import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import {
  getPublicManagementSettings,
  getDerivedGlobalChatRequestsPerMinute,
  getDerivedGlobalTtsRequestsPerMinute,
  updatePublicManagementSettings,
} from '@/lib/public-management';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const settings = getPublicManagementSettings();
    return NextResponse.json(
      {
        ...settings,
        globalChatRequestsPerMinute: getDerivedGlobalChatRequestsPerMinute(settings),
        globalTtsRequestsPerMinute: getDerivedGlobalTtsRequestsPerMinute(settings),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Get public management settings error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const body = await req.json();
    const updated = updatePublicManagementSettings({
      maxConcurrentSessions: body?.maxConcurrentSessions,
      chatRequestsPerUserPerMinute: body?.chatRequestsPerUserPerMinute,
      ttsRequestsPerUserPerMinute: body?.ttsRequestsPerUserPerMinute,
    });

    return NextResponse.json(
      {
        ...updated,
        globalChatRequestsPerMinute: getDerivedGlobalChatRequestsPerMinute(updated),
        globalTtsRequestsPerMinute: getDerivedGlobalTtsRequestsPerMinute(updated),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Update public management settings error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
