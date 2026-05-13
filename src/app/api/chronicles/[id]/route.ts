import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { deleteChronicle, getChronicleById, updateChronicle } from '@/lib/domains';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  const chronicle = getChronicleById(params.id);
  if (!chronicle) {
    return NextResponse.json({ error: 'CHRONICLEが見つかりません' }, { status: 404 });
  }

  return NextResponse.json(chronicle, { status: 200 });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const next = { ...body } as Record<string, unknown>;

    if (typeof next.apiPort !== 'undefined') {
      const apiPort = Number.parseInt(String(next.apiPort), 10);
      if (!Number.isFinite(apiPort) || apiPort < 1 || apiPort > 65535) {
        return NextResponse.json({ error: 'apiPortが不正です' }, { status: 400 });
      }
      next.apiPort = apiPort;
    }

    if (typeof next.tcpPort !== 'undefined') {
      const tcpPort = Number.parseInt(String(next.tcpPort), 10);
      if (!Number.isFinite(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
        return NextResponse.json({ error: 'tcpPortが不正です' }, { status: 400 });
      }
      next.tcpPort = tcpPort;
    }

    const updated = updateChronicle(params.id, next);
    if (!updated) {
      return NextResponse.json({ error: 'CHRONICLE更新に失敗しました' }, { status: 400 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error('Update chronicle error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  const deleted = deleteChronicle(params.id);
  if (!deleted) {
    return NextResponse.json({ error: 'CHRONICLE削除に失敗しました（参照中の可能性があります）' }, { status: 400 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
