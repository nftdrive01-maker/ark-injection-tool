import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { createChronicle, getAllChronicles } from '@/lib/domains';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  const chronicles = getAllChronicles();
  return NextResponse.json(chronicles, { status: 200 });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (!body?.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'CHRONICLE名が必須です' }, { status: 400 });
    }

    if (!body?.host || typeof body.host !== 'string') {
      return NextResponse.json({ error: 'hostが必須です' }, { status: 400 });
    }

    const apiPort = Number.parseInt(String(body.apiPort), 10);
    const tcpPort = Number.parseInt(String(body.tcpPort), 10);
    if (!Number.isFinite(apiPort) || apiPort < 1 || apiPort > 65535) {
      return NextResponse.json({ error: 'apiPortが不正です' }, { status: 400 });
    }
    if (!Number.isFinite(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
      return NextResponse.json({ error: 'tcpPortが不正です' }, { status: 400 });
    }

    const created = createChronicle({
      name: body.name.trim(),
      description: typeof body.description === 'string' ? body.description : '',
      host: body.host.trim(),
      apiPort,
      tcpPort,
      enabled: body.enabled !== false,
      lastDiscoveredAt:
        typeof body.lastDiscoveredAt === 'string' && body.lastDiscoveredAt.trim()
          ? body.lastDiscoveredAt
          : undefined,
      lastConnectedAt:
        typeof body.lastConnectedAt === 'string' && body.lastConnectedAt.trim()
          ? body.lastConnectedAt
          : undefined,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('Create chronicle error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
