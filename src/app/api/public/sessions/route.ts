import { NextRequest, NextResponse } from 'next/server';
import { getPublicManagementSettings } from '@/lib/public-management';
import {
  acquireSession,
  releaseSession,
  heartbeatSession,
  getSessionStatus,
  attachPackToSession,
  detachPackFromSession,
  getAttachedPackIds,
  getSessionDomainId,
} from '@/lib/sessions';
import { getDomainById, getKnowledgeById } from '@/lib/domains';
import { getMCPServerById } from '@/lib/mcp-servers';
import {
  createDomainAccessErrorResponse,
  getDomainAccessTokenFromRequest,
  verifyDomainAccessFromToken,
} from '@/lib/domain-access-control';

const GOOGLE_WORKSPACE_PACK_ID = (process.env.INJECTION_GOOGLE_WORKSPACE_PACK_ID || 'google_workspace').trim().toLowerCase();
const GOOGLE_WORKSPACE_MCP_SERVER_ID = (process.env.INJECTION_GOOGLE_WORKSPACE_MCP_SERVER_ID || 'google-workspace').trim();

const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CLIENT_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-domain-access-token',
};

function verifyRequestDomainAccess(req: NextRequest, domainId?: string): NextResponse | null {
  const normalizedDomainId = String(domainId || '').trim();
  if (!normalizedDomainId) {
    return null;
  }

  const accessResult = verifyDomainAccessFromToken(normalizedDomainId, getDomainAccessTokenFromRequest(req));
  return accessResult.ok ? null : createDomainAccessErrorResponse(accessResult.reason, CORS_HEADERS);
}

type AttachedItem = {
  id: string;
  name: string;
};

function buildAttachedDetails(attachedPackIds: string[]): {
  mcpServers: AttachedItem[];
  knowledges: AttachedItem[];
  unknownPackIds: string[];
} {
  const mcpServers: AttachedItem[] = [];
  const knowledges: AttachedItem[] = [];
  const unknownPackIds: string[] = [];
  const seenMcp = new Set<string>();
  const seenKnowledge = new Set<string>();

  const pushMcp = (item: AttachedItem) => {
    if (!item.id || seenMcp.has(item.id)) return;
    seenMcp.add(item.id);
    mcpServers.push(item);
  };

  const pushKnowledge = (item: AttachedItem) => {
    if (!item.id || seenKnowledge.has(item.id)) return;
    seenKnowledge.add(item.id);
    knowledges.push(item);
  };

  for (const packId of attachedPackIds) {
    const normalizedPackId = (packId || '').trim().toLowerCase();

    if (normalizedPackId === GOOGLE_WORKSPACE_PACK_ID) {
      const googleWorkspaceServer = getMCPServerById(GOOGLE_WORKSPACE_MCP_SERVER_ID);
      if (googleWorkspaceServer) {
        pushMcp({ id: googleWorkspaceServer.id, name: googleWorkspaceServer.name || googleWorkspaceServer.id });
      } else {
        pushMcp({ id: GOOGLE_WORKSPACE_MCP_SERVER_ID, name: GOOGLE_WORKSPACE_MCP_SERVER_ID });
      }
      continue;
    }

    const mcpServer = getMCPServerById(packId);
    if (mcpServer) {
      pushMcp({ id: mcpServer.id, name: mcpServer.name || mcpServer.id });
      continue;
    }

    const knowledge = getKnowledgeById(packId);
    if (knowledge) {
      pushKnowledge({ id: knowledge.id, name: knowledge.name || knowledge.id });
      continue;
    }

    unknownPackIds.push(packId);
  }

  return { mcpServers, knowledges, unknownPackIds };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** セッション状態取得: GET /api/public/sessions */
export async function GET(req: NextRequest) {
  // attached packs fetch: GET /api/public/sessions?action=attached&sessionId=...
  // client-provided attachedPackIds are not trusted anywhere else.
  // This endpoint exposes server-authoritative state only.
  const action = req.nextUrl.searchParams.get('action');
  if (action === 'attached') {
    const sessionId = req.nextUrl.searchParams.get('sessionId') || '';
    const domainIdFromQuery = req.nextUrl.searchParams.get('domainId') || '';
    const attachedPackIds = sessionId ? getAttachedPackIds(sessionId) : [];
    const attachedDetails = buildAttachedDetails(attachedPackIds);

    const domainMcpServers: AttachedItem[] = [];
    const domainKnowledges: AttachedItem[] = [];
    const domainId = sessionId ? getSessionDomainId(sessionId) : undefined;
    const resolvedDomainId = domainIdFromQuery || domainId || undefined;
    const authError = verifyRequestDomainAccess(req, resolvedDomainId);
    if (authError) {
      return authError;
    }
    if (resolvedDomainId) {
      const domain = getDomainById(resolvedDomainId);
      if (domain) {
        for (const mcpServerId of Array.isArray(domain.mcpServerIds) ? domain.mcpServerIds : []) {
          const server = getMCPServerById(mcpServerId);
          if (server) {
            domainMcpServers.push({ id: server.id, name: server.name || server.id });
          }
        }
        for (const knowledgeId of Array.isArray(domain.knowledgeIds) ? domain.knowledgeIds : []) {
          const knowledge = getKnowledgeById(knowledgeId);
          if (knowledge) {
            domainKnowledges.push({ id: knowledge.id, name: knowledge.name || knowledge.id });
          }
        }
      }
    }

    const mergedMcp = [...attachedDetails.mcpServers];
    for (const item of domainMcpServers) {
      if (!mergedMcp.some((existing) => existing.id === item.id)) {
        mergedMcp.push(item);
      }
    }

    const mergedKnowledges = [...attachedDetails.knowledges];
    for (const item of domainKnowledges) {
      if (!mergedKnowledges.some((existing) => existing.id === item.id)) {
        mergedKnowledges.push(item);
      }
    }

    return NextResponse.json(
      {
        attachedPackIds,
        attachedDetails: {
          ...attachedDetails,
          mcpServers: mergedMcp,
          knowledges: mergedKnowledges,
        },
      },
      { status: 200, headers: CORS_HEADERS }
    );
  }

  const authError = verifyRequestDomainAccess(req, req.nextUrl.searchParams.get('domainId') || '');
  if (authError) {
    return authError;
  }

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
    const authError = verifyRequestDomainAccess(req, getSessionDomainId(String(sessionId || '')));
    if (authError) {
      return authError;
    }
    const ok = heartbeatSession(sessionId);
    return NextResponse.json({ ok }, { status: 200, headers: CORS_HEADERS });
  }

  if (action === 'attach') {
    const { sessionId, packId } = await req.json();
    const authError = verifyRequestDomainAccess(req, getSessionDomainId(String(sessionId || '')));
    if (authError) {
      return authError;
    }
    const result = attachPackToSession(String(sessionId || ''), String(packId || ''));
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: CORS_HEADERS });
  }

  if (action === 'detach') {
    const { sessionId, packId } = await req.json();
    const authError = verifyRequestDomainAccess(req, getSessionDomainId(String(sessionId || '')));
    if (authError) {
      return authError;
    }
    const result = detachPackFromSession(String(sessionId || ''), String(packId || ''));
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: CORS_HEADERS });
  }

  // acquire
  const { domainId } = await req.json();
  const authError = verifyRequestDomainAccess(req, String(domainId || 'default'));
  if (authError) {
    return authError;
  }
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
  const authError = verifyRequestDomainAccess(req, getSessionDomainId(String(sessionId || '')));
  if (authError) {
    return authError;
  }
  const released = releaseSession(sessionId);
  return NextResponse.json({ released }, { status: 200, headers: CORS_HEADERS });
}
