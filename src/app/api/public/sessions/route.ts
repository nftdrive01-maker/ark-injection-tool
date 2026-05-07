import { NextRequest, NextResponse } from 'next/server';
import { getPublicManagementSettings } from '@/lib/public-management';
import {
  acquireSession,
  releaseSession,
  heartbeatSession,
  getSessionStatus,
} from '@/lib/sessions';

const AMICA_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': AMICA_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** セッション状態取得: GET /api/public/sessions */
export async function GET() {
  const settings = getPublicManagementSettings();
  const status = getSessionStatus(settings.maxConcurrentSessions);

  return NextResponse.json(status, { status: 200, headers: CORS_HEADERS });
}

/**
 * セッション取得: POST /api/public/sessions
 * body: { domainId?: string }
 * → { acquired: bool, sessionId: string|null, current: number, max: number }
 *
 * ハートビート: POST /api/public/sessions?action=heartbeat
 * body: { sessionId: string }
 * → { ok: bool }
 */
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  if (action === 'heartbeat') {
    const { sessionId } = await req.json();
    const ok = heartbeatSession(sessionId);
    return NextResponse.json({ ok }, { status: 200, headers: CORS_HEADERS });
  }

  // acquire
  const { domainId } = await req.json();
  const settings = getPublicManagementSettings();
  const max = settings.maxConcurrentSessions;
  const result = acquireSession(domainId || 'default', max);

  return NextResponse.json(
    { ...result, max },
    { status: result.acquired ? 200 : 503, headers: CORS_HEADERS },
  );
}

/** セッション解放: DELETE /api/public/sessions  body: { sessionId: string } */
export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  const released = releaseSession(sessionId);
  return NextResponse.json({ released }, { status: 200, headers: CORS_HEADERS });
}
