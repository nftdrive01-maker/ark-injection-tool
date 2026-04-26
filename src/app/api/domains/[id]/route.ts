import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { deleteDomain, getDomainById, updateDomain } from '@/lib/domains';

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

    const domain = getDomainById(params.id);
    if (!domain) {
      return NextResponse.json({ error: 'ドメインが見つかりません' }, { status: 404 });
    }

    return NextResponse.json(domain, { status: 200 });
  } catch (err) {
    console.error('Get domain error:', err);
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
    const updated = updateDomain(params.id, body);

    if (!updated) {
      return NextResponse.json({ error: 'ドメイン更新に失敗しました' }, { status: 400 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('Update domain error:', err);
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

    const deleted = deleteDomain(params.id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'ドメイン削除に失敗しました（最低1件は残す必要があります）' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Delete domain error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
