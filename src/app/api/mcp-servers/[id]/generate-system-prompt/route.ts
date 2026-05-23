import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { generateMCPServerSystemPrompt, getMCPServerById, updateMCPServer } from '@/lib/mcp-servers';

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

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = params;
    const current = getMCPServerById(id);
    if (!current) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    const generated = await generateMCPServerSystemPrompt(id);
    const updated = updateMCPServer(id, {
      aiRouting: {
        enabled: current.aiRouting?.enabled ?? false,
        provider: current.aiRouting?.provider ?? 'ollama',
        model: current.aiRouting?.model ?? process.env.INJECTION_MCP_ROUTER_MODEL ?? process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? 'qwen2.5:7b',
        systemPrompt: generated.systemPrompt,
        temperature: current.aiRouting?.temperature ?? 0.1,
        maxTokens: current.aiRouting?.maxTokens ?? 240,
        confidenceThreshold: current.aiRouting?.confidenceThreshold ?? 0.55,
        allowedTools: current.aiRouting?.allowedTools ?? [],
        fallbackTool: current.aiRouting?.fallbackTool,
      },
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update server' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      server: updated,
      systemPrompt: generated.systemPrompt,
      availableTools: generated.availableTools,
      explorationSummary: generated.explorationSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}