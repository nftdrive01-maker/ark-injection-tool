import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { deletePronunciationRule, updatePronunciationRule } from '@/lib/pronunciations';

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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const body = await req.json();
    const updated = updatePronunciationRule(params.id, {
      from: typeof body.from === 'string' ? body.from : undefined,
      to: typeof body.to === 'string' ? body.to : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      domainId: typeof body.domainId === 'string' && body.domainId.trim() ? body.domainId.trim() : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: '対象ルールが見つかりません' }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('Update pronunciation error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const deleted = deletePronunciationRule(params.id);
    if (!deleted) {
      return NextResponse.json({ error: '対象ルールが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Delete pronunciation error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
