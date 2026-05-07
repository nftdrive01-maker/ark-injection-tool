import { NextRequest, NextResponse } from 'next/server';
import { getAllMCPServers, createMCPServer, validateMCPServerForSave } from '@/lib/mcp-servers';
import { verifyToken, extractToken } from '@/lib/auth';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

/**
 * GET: 全MCPサーバー一覧取得
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const servers = getAllMCPServers();
  return NextResponse.json({ servers });
}

/**
 * POST: 新しいMCPサーバーを作成
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const { name, description, transport, config, enabled, timeout } = body;

    const validation = validateMCPServerForSave(body, { requireName: true });
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid MCP server payload', details: validation.errors },
        { status: 400 }
      );
    }

    if (!name || !transport || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: name, transport, config' },
        { status: 400 }
      );
    }

    if (!['stdio', 'sse', 'http'].includes(transport)) {
      return NextResponse.json(
        { error: 'Invalid transport: must be stdio, sse, or http' },
        { status: 400 }
      );
    }

    const server = createMCPServer({
      name,
      description,
      transport,
      config,
      enabled,
      timeout,
    });

    return NextResponse.json({ server }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
