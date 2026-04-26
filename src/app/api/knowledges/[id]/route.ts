import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { deleteKnowledge, getKnowledgeById, updateKnowledge } from '@/lib/domains';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const knowledge = getKnowledgeById(params.id);
    if (!knowledge) {
      return NextResponse.json({ error: 'ナレッジが見つかりません' }, { status: 404 });
    }

    return NextResponse.json(knowledge, { status: 200 });
  } catch (err) {
    console.error('Get knowledge error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    const updated = updateKnowledge(params.id, body);

    if (!updated) {
      return NextResponse.json({ error: 'ナレッジ更新に失敗しました' }, { status: 400 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('Update knowledge error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const deleted = deleteKnowledge(params.id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'ナレッジ削除に失敗しました（最低1件は残す/参照中ナレッジは削除不可）' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Delete knowledge error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
