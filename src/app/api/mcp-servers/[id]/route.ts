import { NextRequest, NextResponse } from 'next/server';
import {
  getMCPServerById,
  isProtectedMCPServerId,
  updateMCPServer,
  deleteMCPServer,
  validateMCPServerForSave,
} from '@/lib/mcp-servers';
import { verifyToken, extractToken } from '@/lib/auth';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET: 指定IDのMCPサーバーを取得
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = params;
  const server = getMCPServerById(id);

  if (!server) {
    return NextResponse.json(
      { error: 'Server not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ server });
}

/**
 * PUT: MCPサーバーを更新
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = params;
    const body = await req.json();

    const current = getMCPServerById(id);
    if (!current) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }

    const merged = {
      ...current,
      ...body,
      id: current.id,
      createdAt: current.createdAt,
    };

    const validation = validateMCPServerForSave(merged, { requireName: true });
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid MCP server payload', details: validation.errors },
        { status: 400 }
      );
    }

    const updated = updateMCPServer(id, body);

    if (!updated) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ server: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE: MCPサーバーを削除
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = params;

  if (isProtectedMCPServerId(id)) {
    return NextResponse.json(
      { error: 'デフォルトプリセットのMCPサーバーは削除できません' },
      { status: 400 }
    );
  }

  const success = deleteMCPServer(id);

  if (!success) {
    return NextResponse.json(
      { error: 'Server not found or still referenced by domains' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
