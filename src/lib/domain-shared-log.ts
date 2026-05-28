import { spawn } from 'child_process';
import path from 'path';

const DOMAIN_SHARED_LOG_DB_PATH =
  process.env.INJECTION_DOMAIN_SHARED_LOG_DB_PATH || './data/domain-shared-logs.sqlite';
const DOMAIN_SHARED_LOG_WRITER_PATH = path.resolve(
  process.cwd(),
  'src/lib/domain-shared-log-writer.cjs',
);
const DOMAIN_SHARED_LOG_READER_PATH = path.resolve(
  process.cwd(),
  'src/lib/domain-shared-log-reader.cjs',
);

type DomainSharedLogInput = {
  domainId: string;
  requestId: string;
  sessionId: string | null;
  userId: string;
  userText: string;
  requestBody: unknown;
  responseBody: unknown;
  mcpResult?: unknown;
  chronicleResult?: unknown;
};

export type DomainSharedLogRecord = {
  id: number;
  domainId: string;
  requestId: string;
  sessionId: string | null;
  userId: string;
  userText: string;
  requestBody: unknown;
  responseBody: unknown;
  mcpResult: unknown;
  chronicleResult: unknown;
  createdAt: string;
  mcpUsed: boolean;
  mcpToolName?: string;
  chronicleUsed: boolean;
};

export type DomainSharedLogListResult = {
  logs: DomainSharedLogRecord[];
  total: number;
  limit: number;
};

function runNodeScript(scriptPath: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `domain shared log script exited with code ${code}`));
    });

    child.stdin.end(payload);
  });
}

export async function writeDomainSharedLog(input: DomainSharedLogInput): Promise<void> {
  const dbFilePath = path.resolve(process.cwd(), DOMAIN_SHARED_LOG_DB_PATH);
  await runNodeScript(
    DOMAIN_SHARED_LOG_WRITER_PATH,
    JSON.stringify({
      dbFilePath,
      entry: input,
    }),
  );
}

export async function listDomainSharedLogs(params?: {
  domainId?: string;
  limit?: number;
}): Promise<DomainSharedLogListResult> {
  const dbFilePath = path.resolve(process.cwd(), DOMAIN_SHARED_LOG_DB_PATH);
  const stdout = await runNodeScript(
    DOMAIN_SHARED_LOG_READER_PATH,
    JSON.stringify({
      dbFilePath,
      domainId: params?.domainId,
      limit: params?.limit,
    }),
  );

  const payload = JSON.parse(stdout || '{}') as Partial<DomainSharedLogListResult>;
  return {
    logs: Array.isArray(payload.logs) ? payload.logs : [],
    total: typeof payload.total === 'number' ? payload.total : 0,
    limit: typeof payload.limit === 'number' ? payload.limit : params?.limit || 100,
  };
}