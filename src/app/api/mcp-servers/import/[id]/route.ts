import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  getMCPServerById,
  updateMCPServer,
  validateMCPServerForSave,
} from '../../../../../lib/mcp-servers';

interface ServerMetadata {
  name: string;
  description: string;
  tools: Array<{
    name: string;
    description: string;
  }>;
  defaultConfig: {
    mode: string;
    timeout: number;
    aiRouting?: {
      provider: string;
      model: string;
      temperature: number;
      maxTokens: number;
      confidenceThreshold: number;
      allowedTools: string[];
      fallbackTool: string;
      systemPrompt: string;
    };
  };
}

interface ImportRequest {
  mcp_server_url: string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serverId = params.id;

    if (!serverId) {
      return NextResponse.json(
        { error: 'Server ID is required' },
        { status: 400 }
      );
    }

    const body = (await request.json()) as ImportRequest;

    if (!body.mcp_server_url) {
      return NextResponse.json(
        { error: 'mcp_server_url is required' },
        { status: 400 }
      );
    }

    const existingServer = getMCPServerById(serverId);

    if (!existingServer) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    const metadata = await fetchMCPServerMetadata(body.mcp_server_url);

    if (!metadata) {
      return NextResponse.json(
        { error: 'Failed to fetch MCP server metadata' },
        { status: 400 }
      );
    }

    const updatedPayload = {
      ...existingServer,
      config: {
        ...existingServer.config,
        url: body.mcp_server_url,
      },
      timeout: metadata.defaultConfig.timeout || 10000,
      mode: (metadata.defaultConfig.mode as any) || existingServer.mode || 'ai',
      ruleRouting: {
        enabled: false,
        rules: [],
      },
      aiRouting: metadata.defaultConfig.aiRouting
        ? {
            enabled: true,
            provider: metadata.defaultConfig.aiRouting.provider as any,
            model: metadata.defaultConfig.aiRouting.model || existingServer.aiRouting?.model || 'mistral',
            systemPrompt: metadata.defaultConfig.aiRouting.systemPrompt,
            temperature: metadata.defaultConfig.aiRouting.temperature,
            maxTokens: metadata.defaultConfig.aiRouting.maxTokens,
            confidenceThreshold:
              metadata.defaultConfig.aiRouting.confidenceThreshold,
            allowedTools: metadata.defaultConfig.aiRouting.allowedTools,
            fallbackTool: metadata.defaultConfig.aiRouting.fallbackTool,
          }
        : existingServer.aiRouting,
    };

    const validation = validateMCPServerForSave(updatedPayload);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid MCP server configuration', details: validation.errors },
        { status: 400 }
      );
    }

    const updatedServer = updateMCPServer(serverId, updatedPayload);

    if (!updatedServer) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, server: updatedServer });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { error: 'Update failed', details: String(error) },
      { status: 500 }
    );
  }
}

async function fetchMCPServerMetadata(url: string): Promise<ServerMetadata | null> {
  try {
    const transport = new SSEClientTransport(new URL(url));
    const client = new Client({
      name: 'injection-tool',
      version: '1.0.0',
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: 'get_server_metadata',
      arguments: {},
    });

    await client.close();

    if (
      !result ||
      !result.content ||
      !Array.isArray(result.content) ||
      result.content.length === 0
    ) {
      return null;
    }

    const textContent = (result.content as any)[0];
    if (typeof textContent !== 'object' || textContent.type !== 'text') {
      return null;
    }

    return JSON.parse(textContent.text) as ServerMetadata;
  } catch (error) {
    console.error('Failed to fetch MCP metadata:', error);
    return null;
  }
}