import net from 'net';

export interface BeyondCoreInfo {
  success?: boolean;
  running?: boolean;
  server_name?: string;
  name?: string;
  description?: string;
  tools?: Array<{ name?: string; description?: string }>;
}

export interface BeyondCoreModel {
  id?: number | string;
  provider?: string;
  model_name?: string;
  is_default?: boolean;
}

export interface BeyondCoreDiscoveryResult {
  ok: boolean;
  running: boolean;
  serverName: string;
  description: string;
  toolCount: number;
  connected: boolean;
  infoUrl: string;
  modelReady: boolean;
  modelsCount: number;
  defaultModelName?: string;
  modelsUrl: string;
  error?: string;
}

export interface BeyondCoreToolCallResult {
  ok: boolean;
  output?: string;
  error?: string;
}

type ChronicleCitation = {
  memory_item_id?: number | string;
  title?: string;
  source?: {
    network?: string;
    address?: string;
    namespace?: string;
    data_address?: string;
    block_height?: number | string;
  };
  used_for?: string;
};

type ChronicleNote = {
  type?: string;
  message?: string;
};

function formatChronicleCitations(citations: ChronicleCitation[] | undefined): string {
  if (!Array.isArray(citations) || citations.length === 0) {
    return '';
  }

  const lines: string[] = ['出典'];

  citations.forEach((citation, index) => {
    const title = (citation.title || `memory_item_id: ${citation.memory_item_id ?? '-'}`).trim();
    lines.push(`[${index + 1}] ${title}`);

    const source = citation.source;
    if (source) {
      const sourceParts = [
        source.network ? `network: ${source.network}` : '',
        source.address ? `address: ${source.address}` : '',
        source.namespace ? `namespace: ${source.namespace}` : '',
        source.data_address ? `data_address: ${source.data_address}` : '',
        source.block_height !== undefined && source.block_height !== null ? `block: ${source.block_height}` : '',
      ].filter(Boolean);

      if (sourceParts.length > 0) {
        lines.push(sourceParts.join(' / '));
      }
    }

    if (citation.used_for) {
      lines.push(citation.used_for);
    }

    if (index < citations.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n').trim();
}

function formatChronicleNotes(notes: ChronicleNote[] | undefined): string {
  if (!Array.isArray(notes) || notes.length === 0) {
    return '';
  }

  const lines: string[] = ['補足'];
  notes.forEach((note) => {
    const type = note.type ? `[${note.type}] ` : '';
    const message = typeof note.message === 'string' ? note.message.trim() : '';
    if (message) {
      lines.push(`${type}${message}`);
    }
  });

  return lines.length > 1 ? lines.join('\n').trim() : '';
}

function extractToolText(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return '';
  }

  const payload = result as {
    content?: Array<{ type?: string; text?: string }>;
    answer?: { title?: string; body?: string };
    citations?: ChronicleCitation[];
    notes?: ChronicleNote[];
    text?: string;
    message?: string;
  };

  const citationsText = formatChronicleCitations(payload.citations);
  const notesText = formatChronicleNotes(payload.notes);

  // 区切りラベル
  const citationBlock = citationsText ? `--- 出典 ---\n${citationsText}` : '';
  const notesBlock = notesText ? `--- 補足 ---\n${notesText}` : '';

  if (Array.isArray(payload.content)) {
    const contentText = payload.content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text as string)
      .join('\n')
      .trim();

    if (contentText) {
      return [contentText, citationBlock, notesBlock].filter(Boolean).join('\n\n').trim();
    }
  }

  const answerTitle = typeof payload.answer?.title === 'string' ? payload.answer.title.trim() : '';
  const answerBody = typeof payload.answer?.body === 'string' ? payload.answer.body.trim() : '';
  if (answerTitle || answerBody) {
    return [answerTitle, answerBody, citationBlock, notesBlock].filter(Boolean).join('\n\n').trim();
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return [payload.text.trim(), citationBlock, notesBlock].filter(Boolean).join('\n\n').trim();
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return [payload.message.trim(), citationBlock, notesBlock].filter(Boolean).join('\n\n').trim();
  }

  return [citationBlock, notesBlock].filter(Boolean).join('\n\n').trim();
}

function normalizeHost(host: string): string {
  return host.trim() || '127.0.0.1';
}

function normalizePort(port: number, fallback: number): number {
  if (!Number.isFinite(port)) {
    return fallback;
  }

  const normalized = Math.floor(port);
  if (normalized < 1 || normalized > 65535) {
    return fallback;
  }

  return normalized;
}

export async function testBeyondCoreTcpConnection(
  host: string,
  tcpPort: number,
  timeoutMs = 2500,
): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  const normalizedPort = normalizePort(tcpPort, 8001);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    socket.connect(normalizedPort, normalizedHost);
  });
}

export async function callBeyondCoreTool(input: {
  host: string;
  tcpPort: number;
  toolName: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<BeyondCoreToolCallResult> {
  const host = normalizeHost(input.host);
  const port = normalizePort(input.tcpPort, 8001);
  const timeoutMs = Number.isFinite(input.timeoutMs) ? Math.max(1000, input.timeoutMs as number) : 5000;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buffer = '';
    let settled = false;

    const finish = (result: BeyondCoreToolCallResult) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: input.toolName,
          arguments: input.args || {},
        },
        id: 1,
      };
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd < 0) {
        return;
      }

      const line = buffer.slice(0, lineEnd).trim();
      if (!line) {
        return;
      }

      try {
        const parsed = JSON.parse(line) as {
          error?: { message?: string };
          result?: unknown;
        };

        if (parsed.error) {
          finish({ ok: false, error: parsed.error.message || 'BEYOND Core tool error' });
          return;
        }

        const text = extractToolText(parsed.result);

        finish({ ok: true, output: text || '' });
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : 'Invalid JSON-RPC response' });
      }
    });

    socket.on('timeout', () => finish({ ok: false, error: 'TCP timeout' }));
    socket.on('error', (err) => finish({ ok: false, error: err.message }));

    socket.connect(port, host);
  });
}

export async function callChronicleChat(input: {
  host: string;
  tcpPort: number;
  message: string;
  memoryIds?: (string | number)[];
}): Promise<BeyondCoreToolCallResult> {
  const args: Record<string, unknown> = {
    message: input.message,
    mode: 'default',
  };

  if (Array.isArray(input.memoryIds) && input.memoryIds.length > 0) {
    args.memory_ids = input.memoryIds;
  }

  const configuredTimeout = Number.parseInt(process.env.CHRONICLE_TOOL_TIMEOUT_MS || '', 10);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 15000;

  return callBeyondCoreTool({
    host: input.host,
    tcpPort: input.tcpPort,
    toolName: 'chronicle_chat',
    args,
    timeoutMs,
  });
}

export async function discoverBeyondCoreServer(input: {
  host: string;
  apiPort: number;
  tcpPort: number;
}): Promise<BeyondCoreDiscoveryResult> {
  const host = normalizeHost(input.host);
  const apiPort = normalizePort(input.apiPort, 8000);
  const tcpPort = normalizePort(input.tcpPort, 8001);
  const infoUrl = `http://${host}:${apiPort}/api/mcp/info`;
  const modelsUrl = `http://${host}:${apiPort}/api/models`;

  let info: BeyondCoreInfo | null = null;
  let running = false;
  let serverName = 'BEYOND Core MCP';
  let description = '';
  let toolCount = 0;
  let models: BeyondCoreModel[] = [];
  let modelReady = false;
  let defaultModelName: string | undefined;

  try {
    const response = await fetch(infoUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        ok: false,
        running: false,
        serverName,
        description,
        toolCount: 0,
        connected: false,
        infoUrl,
        modelReady: false,
        modelsCount: 0,
        modelsUrl,
        error: `/api/mcp/info の取得に失敗しました: ${response.status}`,
      };
    }

    info = await response.json();
    running = info?.running === true;
    serverName = (info?.server_name || info?.name || serverName).trim();
    description = (info?.description || '').trim();
    toolCount = Array.isArray(info?.tools) ? info.tools.length : 0;
  } catch (err) {
    return {
      ok: false,
      running: false,
      serverName,
      description,
      toolCount: 0,
      connected: false,
      infoUrl,
      modelReady: false,
      modelsCount: 0,
      modelsUrl,
      error: err instanceof Error ? err.message : 'BEYOND Core の検出中にエラーが発生しました',
    };
  }

  const connected = await testBeyondCoreTcpConnection(host, tcpPort);

  try {
    const modelsResponse = await fetch(modelsUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (modelsResponse.ok) {
      const modelsPayload = await modelsResponse.json();
      models = Array.isArray(modelsPayload)
        ? modelsPayload
        : Array.isArray(modelsPayload?.models)
          ? modelsPayload.models
          : [];
      const defaultModel = models.find((model) => model?.is_default === true);
      defaultModelName = typeof defaultModel?.model_name === 'string'
        ? defaultModel.model_name
        : undefined;
      modelReady = models.length > 0 && Boolean(defaultModelName);
    }
  } catch {
    // /api/models is optional for older BEYOND Core versions; keep modelReady=false
  }

  const isReady = running && connected && modelReady;
  const error = isReady
    ? undefined
    : !running || !connected
      ? 'BEYOND Core MCP が起動中か確認してください'
      : 'BEYOND Core のAIモデルが未設定です（/api/models を確認）';

  return {
    ok: isReady,
    running,
    serverName,
    description,
    toolCount,
    connected,
    infoUrl,
    modelReady,
    modelsCount: models.length,
    defaultModelName,
    modelsUrl,
    error,
  };
}
