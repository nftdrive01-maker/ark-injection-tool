import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import {
  getCloudflareTunnelStatus,
  startCloudflareQuickTunnel,
  stopCloudflareQuickTunnel,
} from '@/lib/cloudflare-tunnel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  return NextResponse.json(getCloudflareTunnelStatus(), { status: 200 });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const status = await startCloudflareQuickTunnel(typeof body?.targetUrl === 'string' ? body.targetUrl : undefined);
    return NextResponse.json(status, { status: status.publicUrl ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudflare Tunnel の起動に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  return NextResponse.json(stopCloudflareQuickTunnel(), { status: 200 });
}