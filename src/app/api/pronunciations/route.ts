import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { createPronunciationRule, getAllPronunciationRules } from '@/lib/pronunciations';

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

    return NextResponse.json(getAllPronunciationRules(), { status: 200 });
  } catch (err) {
    console.error('Get pronunciations error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const body = await req.json();

    if (!body?.from || !body?.to || typeof body.from !== 'string' || typeof body.to !== 'string') {
      return NextResponse.json({ error: 'from/to は必須です' }, { status: 400 });
    }

    const created = createPronunciationRule({
      from: body.from.trim(),
      to: body.to.trim(),
      enabled: body.enabled,
      priority: body.priority,
      domainId: typeof body.domainId === 'string' && body.domainId.trim() ? body.domainId.trim() : undefined,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('Create pronunciation error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
