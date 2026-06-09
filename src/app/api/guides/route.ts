import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { createGuide, getAllGuides } from '@/lib/guides';

function verifyAdminRequest(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const token = extractToken(authHeader);
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
  }

  return null;
}

export async function GET(req: NextRequest) {
  const authError = verifyAdminRequest(req);
  if (authError) {
    return authError;
  }

  try {
    return NextResponse.json(getAllGuides(), { status: 200 });
  } catch (err) {
    console.error('Get guides error:', err);
    return NextResponse.json({ error: 'ガイド一覧の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdminRequest(req);
  if (authError) {
    return authError;
  }

  try {
    const body = await req.json();
    const created = createGuide(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('Create guide error:', err);
    return NextResponse.json({ error: 'ガイドの作成に失敗しました' }, { status: 500 });
  }
}
