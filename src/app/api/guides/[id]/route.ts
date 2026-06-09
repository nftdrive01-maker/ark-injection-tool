import { NextRequest, NextResponse } from 'next/server';
import { deleteGuide, getGuideById, updateGuide } from '@/lib/guides';
import { extractToken, verifyToken } from '@/lib/auth';

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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = verifyAdminRequest(req);
  if (authError) {
    return authError;
  }

  try {
    const guide = getGuideById(params.id);
    if (!guide) {
      return NextResponse.json({ error: 'ガイドが見つかりません' }, { status: 404 });
    }

    return NextResponse.json(guide, { status: 200 });
  } catch (err) {
    console.error('Get guide error:', err);
    return NextResponse.json({ error: 'ガイドの取得に失敗しました' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = verifyAdminRequest(req);
  if (authError) {
    return authError;
  }

  try {
    const body = await req.json();
    const updated = updateGuide(params.id, body);
    if (!updated) {
      return NextResponse.json({ error: 'ガイドの更新に失敗しました' }, { status: 400 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('Update guide error:', err);
    return NextResponse.json({ error: 'ガイドの更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = verifyAdminRequest(req);
  if (authError) {
    return authError;
  }

  try {
    const deleted = deleteGuide(params.id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'ガイドの削除に失敗しました。最低1件は残してください。' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Delete guide error:', err);
    return NextResponse.json({ error: 'ガイドの削除に失敗しました' }, { status: 500 });
  }
}
