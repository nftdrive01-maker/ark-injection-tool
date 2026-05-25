import { spawn, type ChildProcess } from 'node:child_process';

export interface CloudflareTunnelStatus {
  active: boolean;
  starting: boolean;
  publicUrl: string | null;
  targetUrl: string;
  pid: number | null;
  startedAt: number | null;
  lastError: string | null;
}

type TunnelState = {
  process: ChildProcess | null;
  targetUrl: string;
  publicUrl: string | null;
  pid: number | null;
  startedAt: number | null;
  starting: boolean;
  lastError: string | null;
  logs: string[];
  readyPromise: Promise<CloudflareTunnelStatus> | null;
  resolveReady: ((status: CloudflareTunnelStatus) => void) | null;
  rejectReady: ((error: Error) => void) | null;
};

const CLOUDFLARED_BIN = process.env.CLOUDFLARED_BIN || 'cloudflared';
const QUICK_TUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu;

const globalForTunnel = globalThis as typeof globalThis & {
  __injectionCloudflareTunnelState?: TunnelState;
};

function getDefaultTargetUrl(): string {
  return process.env.INJECTION_PUBLIC_TUNNEL_TARGET_URL || `http://127.0.0.1:${process.env.PORT || '4001'}`;
}

function createInitialState(): TunnelState {
  return {
    process: null,
    targetUrl: getDefaultTargetUrl(),
    publicUrl: null,
    pid: null,
    startedAt: null,
    starting: false,
    lastError: null,
    logs: [],
    readyPromise: null,
    resolveReady: null,
    rejectReady: null,
  };
}

const tunnelState = globalForTunnel.__injectionCloudflareTunnelState || createInitialState();
globalForTunnel.__injectionCloudflareTunnelState = tunnelState;

function getStatus(): CloudflareTunnelStatus {
  return {
    active: Boolean(tunnelState.process && tunnelState.publicUrl),
    starting: tunnelState.starting,
    publicUrl: tunnelState.publicUrl,
    targetUrl: tunnelState.targetUrl,
    pid: tunnelState.pid,
    startedAt: tunnelState.startedAt,
    lastError: tunnelState.lastError,
  };
}

function clearReadyHandlers(): void {
  tunnelState.readyPromise = null;
  tunnelState.resolveReady = null;
  tunnelState.rejectReady = null;
}

function resolveReady(): void {
  if (tunnelState.resolveReady) {
    tunnelState.resolveReady(getStatus());
  }
  clearReadyHandlers();
}

function rejectReady(message: string): void {
  if (tunnelState.rejectReady) {
    tunnelState.rejectReady(new Error(message));
  }
  clearReadyHandlers();
}

function normalizeTargetUrl(input?: string): string {
  const raw = (input || getDefaultTargetUrl()).trim();
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('トンネル転送先 URL の形式が不正です');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('トンネル転送先 URL は http または https のみ指定できます');
  }

  return parsed.toString().replace(/\/$/, '');
}

function appendLogs(chunk: string): void {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return;
  }

  tunnelState.logs.push(...lines);
  if (tunnelState.logs.length > 40) {
    tunnelState.logs = tunnelState.logs.slice(-40);
  }
}

function currentProcessIsAlive(): boolean {
  return Boolean(tunnelState.process && !tunnelState.process.killed);
}

function waitForReady(timeoutMs = 20000): Promise<CloudflareTunnelStatus> {
  if (!tunnelState.readyPromise) {
    return Promise.resolve(getStatus());
  }

  return Promise.race([
    tunnelState.readyPromise,
    new Promise<CloudflareTunnelStatus>((resolve) => {
      setTimeout(() => resolve(getStatus()), timeoutMs);
    }),
  ]);
}

export function getCloudflareTunnelStatus(): CloudflareTunnelStatus {
  return getStatus();
}

export async function startCloudflareQuickTunnel(targetUrl?: string): Promise<CloudflareTunnelStatus> {
  if (currentProcessIsAlive()) {
    if (tunnelState.publicUrl || !tunnelState.starting) {
      return getStatus();
    }

    return waitForReady();
  }

  const normalizedTargetUrl = normalizeTargetUrl(targetUrl);

  tunnelState.targetUrl = normalizedTargetUrl;
  tunnelState.publicUrl = null;
  tunnelState.pid = null;
  tunnelState.startedAt = Date.now();
  tunnelState.starting = true;
  tunnelState.lastError = null;
  tunnelState.logs = [];
  tunnelState.readyPromise = new Promise<CloudflareTunnelStatus>((resolve, reject) => {
    tunnelState.resolveReady = resolve;
    tunnelState.rejectReady = reject;
  });

  const child = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', normalizedTargetUrl, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  tunnelState.process = child;
  tunnelState.pid = child.pid ?? null;

  const handleOutput = (chunk: Buffer | string) => {
    const text = chunk.toString();
    appendLogs(text);
    const matchedUrl = text.match(QUICK_TUNNEL_URL_REGEX)?.[0] || tunnelState.logs.join('\n').match(QUICK_TUNNEL_URL_REGEX)?.[0];

    if (matchedUrl && !tunnelState.publicUrl) {
      tunnelState.publicUrl = matchedUrl;
      tunnelState.starting = false;
      tunnelState.lastError = null;
      resolveReady();
    }
  };

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', handleOutput);

  child.on('error', (error) => {
    const message =
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'cloudflared が見つかりません。PATH に追加するか CLOUDFLARED_BIN を設定してください。'
        : `cloudflared の起動に失敗しました: ${error.message}`;

    tunnelState.process = null;
    tunnelState.pid = null;
    tunnelState.publicUrl = null;
    tunnelState.startedAt = null;
    tunnelState.starting = false;
    tunnelState.lastError = message;
    rejectReady(message);
  });

  child.on('close', (code, signal) => {
    const hadPublicUrl = tunnelState.publicUrl;
    const message =
      tunnelState.lastError ||
      (code === 0 || signal === 'SIGTERM'
        ? 'Cloudflare Tunnel を停止しました。'
        : `Cloudflare Tunnel が終了しました (code=${code ?? 'unknown'}, signal=${signal ?? 'none'})`);

    tunnelState.process = null;
    tunnelState.pid = null;
    tunnelState.publicUrl = null;
    tunnelState.startedAt = null;
    tunnelState.starting = false;
    tunnelState.lastError = message;

    if (!hadPublicUrl) {
      rejectReady(message);
    } else {
      clearReadyHandlers();
    }
  });

  return waitForReady();
}

export function stopCloudflareQuickTunnel(): CloudflareTunnelStatus {
  if (tunnelState.process && !tunnelState.process.killed) {
    const runningProcess = tunnelState.process;
    tunnelState.lastError = 'Cloudflare Tunnel を停止しました。';
    tunnelState.process = null;
    tunnelState.pid = null;
    tunnelState.publicUrl = null;
    tunnelState.startedAt = null;
    tunnelState.starting = false;
    runningProcess.kill();
  } else {
    tunnelState.process = null;
    tunnelState.pid = null;
    tunnelState.publicUrl = null;
    tunnelState.startedAt = null;
    tunnelState.starting = false;
  }

  return getStatus();
}