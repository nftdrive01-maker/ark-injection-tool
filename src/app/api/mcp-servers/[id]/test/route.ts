import { NextRequest, NextResponse } from 'next/server';
import { testMCPServerConnection } from '@/lib/mcp-servers';
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
 * GET: MCPサーバーの接続テスト
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = params;
    const result = await testMCPServerConnection(id);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
