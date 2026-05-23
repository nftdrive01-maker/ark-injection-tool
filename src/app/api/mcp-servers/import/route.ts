import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  createMCPServer,
  getAllMCPServers,
  updateMCPServer,
  validateMCPServerForSave,
} from '../../../../lib/mcp-servers';
import { v4 as uuidv4 } from 'uuid';

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
  name?: string;
}

/**
 * POST /api/mcp-servers/import
 * MCPサーバーのメタデータをインポート
 *
 * Request body:
 * {
 *   "mcp_server_url": "http://localhost:8000/sse",
 *   "name": "custom-server-name" (optional)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "server": { MCPServer }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ImportRequest;

    if (!body.mcp_server_url) {
      return NextResponse.json(
        { error: 'mcp_server_url is required' },
        { status: 400 }
      );
    }

    // MCPサーバーのメタデータを取得
    const metadata = await fetchMCPServerMetadata(body.mcp_server_url);

    if (!metadata) {
      return NextResponse.json(
        { error: 'Failed to fetch MCP server metadata' },
        { status: 400 }
      );
    }

    // MCPサーバー設定を構築
    const serverName = body.name || metadata.name;
    const now = new Date().toISOString();
    const newServerPayload = {
      id: uuidv4(),
      name: serverName,
      description: metadata.description,
      transport: 'sse',
      enabled: true,
      timeout: metadata.defaultConfig.timeout || 10000,
      createdAt: now,
      updatedAt: now,
      config: {
        url: body.mcp_server_url,
      },
      mode: (metadata.defaultConfig.mode as any) || 'ai',
      aiRouting: metadata.defaultConfig.aiRouting
        ? {
            enabled: true,
            provider: metadata.defaultConfig.aiRouting.provider as any,
            model: metadata.defaultConfig.aiRouting.model || 'mistral',
            systemPrompt: metadata.defaultConfig.aiRouting.systemPrompt,
            temperature: metadata.defaultConfig.aiRouting.temperature,
            maxTokens: metadata.defaultConfig.aiRouting.maxTokens,
            confidenceThreshold: metadata.defaultConfig.aiRouting.confidenceThreshold,
            allowedTools: metadata.defaultConfig.aiRouting.allowedTools,
            fallbackTool: metadata.defaultConfig.aiRouting.fallbackTool,
          }
        : undefined,
    };

    // バリデーション
    const validation = validateMCPServerForSave(newServerPayload);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid MCP server configuration', details: validation.errors },
        { status: 400 }
      );
    }

    // 同名サーバーがあれば更新、なければ新規作成
    const existingServer = getAllMCPServers().find((server) => server.name === serverName);
    const savedServer = existingServer
      ? updateMCPServer(existingServer.id, {
          name: serverName,
          description: metadata.description,
          transport: 'sse',
          enabled: true,
          timeout: metadata.defaultConfig.timeout || 10000,
          config: { url: body.mcp_server_url },
          mode: (metadata.defaultConfig.mode as any) || 'ai',          ruleRouting: {
            enabled: false,
            rules: [],
          },          aiRouting: metadata.defaultConfig.aiRouting
            ? {
                enabled: true,
                provider: metadata.defaultConfig.aiRouting.provider as any,
                model: metadata.defaultConfig.aiRouting.model || existingServer.aiRouting?.model || 'mistral',
                systemPrompt: metadata.defaultConfig.aiRouting.systemPrompt,
                temperature: metadata.defaultConfig.aiRouting.temperature,
                maxTokens: metadata.defaultConfig.aiRouting.maxTokens,
                confidenceThreshold: metadata.defaultConfig.aiRouting.confidenceThreshold,
                allowedTools: metadata.defaultConfig.aiRouting.allowedTools,
                fallbackTool: metadata.defaultConfig.aiRouting.fallbackTool,
              }
            : existingServer.aiRouting,
        })
      : createMCPServer({
          name: serverName,
          description: metadata.description,
          transport: 'sse',
          enabled: true,
          timeout: metadata.defaultConfig.timeout || 10000,
          config: { url: body.mcp_server_url },
          mode: (metadata.defaultConfig.mode as any) || 'ai',
          aiRouting: metadata.defaultConfig.aiRouting
            ? {
                enabled: true,
                provider: metadata.defaultConfig.aiRouting.provider as any,
                model: metadata.defaultConfig.aiRouting.model || 'mistral',
                systemPrompt: metadata.defaultConfig.aiRouting.systemPrompt,
                temperature: metadata.defaultConfig.aiRouting.temperature,
                maxTokens: metadata.defaultConfig.aiRouting.maxTokens,
                confidenceThreshold: metadata.defaultConfig.aiRouting.confidenceThreshold,
                allowedTools: metadata.defaultConfig.aiRouting.allowedTools,
                fallbackTool: metadata.defaultConfig.aiRouting.fallbackTool,
              }
            : undefined,
        });

    if (!savedServer) {
      return NextResponse.json(
        { error: 'Failed to save imported MCP server' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, server: savedServer });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * MCPサーバーのメタデータを取得
 */
async function fetchMCPServerMetadata(url: string): Promise<ServerMetadata | null> {
  try {
    // Docker環境では localhost を内部サービス名に置換
    const internalBase = process.env.INJECTION_MCP_INTERNAL_BASE_URL || 'http://mcp-server:8000';
    let resolvedUrl = url;
    if (internalBase) {
      resolvedUrl = url.replace(/^https?:\/\/localhost(:\d+)?/, internalBase);
    }

    // SSE トランスポートでMCPサーバーに接続
    const transport = new SSEClientTransport(new URL(resolvedUrl));
    const client = new Client({
      name: 'injection-tool',
      version: '1.0.0',
    });

    await client.connect(transport);

    // get_server_metadata ツールを実行
    const result = await client.callTool({
      name: 'get_server_metadata',
      arguments: {},
    });

    await client.close();

    if (!result || !result.content || !Array.isArray(result.content) || result.content.length === 0) {
      return null;
    }

    // ツールがテキスト形式で返した JSON をパース
    const textContent = (result.content as any)[0];
    if (typeof textContent !== 'object' || textContent.type !== 'text') {
      return null;
    }

    const metadata = JSON.parse(textContent.text) as ServerMetadata;
    return metadata;
  } catch (error) {
    console.error('Failed to fetch MCP metadata:', error);
    return null;
  }
}

