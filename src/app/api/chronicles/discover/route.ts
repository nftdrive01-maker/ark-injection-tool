import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { createChronicle, getAllChronicles, updateChronicle } from '@/lib/domains';
import { discoverBeyondCoreServer } from '@/lib/beyond-core-client';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const host = typeof body?.host === 'string' ? body.host.trim() : '';
    const apiPort = Number.parseInt(String(body?.apiPort), 10);
    const tcpPort = Number.parseInt(String(body?.tcpPort), 10);

    if (!host) {
      return NextResponse.json({ error: 'hostが必須です' }, { status: 400 });
    }

    if (!Number.isFinite(apiPort) || apiPort < 1 || apiPort > 65535) {
      return NextResponse.json({ error: 'apiPortが不正です' }, { status: 400 });
    }

    if (!Number.isFinite(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
      return NextResponse.json({ error: 'tcpPortが不正です' }, { status: 400 });
    }

    const discovery = await discoverBeyondCoreServer({ host, apiPort, tcpPort });
    if (!discovery.ok) {
      return NextResponse.json(
        {
          success: false,
          error: discovery.error || 'BEYOND Core MCPの検出に失敗しました',
          discovery,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const requestedName = typeof body?.name === 'string' ? body.name.trim() : '';
    const requestedDescription = typeof body?.description === 'string' ? body.description : '';

    const existing = getAllChronicles().find(
      (item) => item.host === host && item.apiPort === apiPort && item.tcpPort === tcpPort
    );

    const chronicle = existing
      ? updateChronicle(existing.id, {
          name: requestedName || existing.name,
          description: requestedDescription || existing.description,
          enabled: true,
          lastDiscoveredAt: now,
          lastConnectedAt: now,
        })
      : createChronicle({
          name: requestedName || discovery.serverName,
          description: requestedDescription || discovery.description,
          host,
          apiPort,
          tcpPort,
          enabled: true,
          lastDiscoveredAt: now,
          lastConnectedAt: now,
        });

    return NextResponse.json(
      {
        success: true,
        chronicle,
        discovery,
      },
      { status: existing ? 200 : 201 }
    );
  } catch (err) {
    console.error('Discover chronicle error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
