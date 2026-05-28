import { spawn } from 'child_process';
import path from 'path';

const DOMAIN_CHAT_HISTORY_DB_PATH =
  process.env.INJECTION_DOMAIN_CHAT_HISTORY_DB_PATH || './data/domain-chat-history.sqlite';
const DOMAIN_CHAT_HISTORY_WRITER_PATH = path.resolve(
  process.cwd(),
  'src/lib/domain-chat-history-writer.cjs',
);
const DOMAIN_CHAT_HISTORY_READER_PATH = path.resolve(
  process.cwd(),
  'src/lib/domain-chat-history-reader.cjs',
);

export type DomainChatHistoryEntry = {
  historyId: string;
  domainId: string;
  userId?: string;
  role: 'assistant' | 'system' | 'user';
  content: string;
  createdAt: number;
  createdAtDayKey: string;
  sessionId?: string;
  dbResult?: {
    title?: string;
    sourceName?: string;
    toolName?: string;
    summary?: string;
    queryText?: string;
    sortLabel?: string;
    totalCount?: number;
    previewColumns?: string[];
    previewRows?: Array<Record<string, string | number | boolean | null>>;
  };
  mcpInfo?: {
    used?: boolean;
    serverId?: string;
    toolName?: string;
  };
};

export type DomainChatHistoryListResult = {
  items: DomainChatHistoryEntry[];
  totalCount: number;
  limit: number;
  availableUserIds: string[];
  availableSessionIds: string[];
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

      reject(new Error(stderr.trim() || `domain chat history script exited with code ${code}`));
    });

    child.stdin.end(payload);
  });
}

export async function upsertDomainChatHistoryEntries(entries: DomainChatHistoryEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const dbFilePath = path.resolve(process.cwd(), DOMAIN_CHAT_HISTORY_DB_PATH);
  await runNodeScript(
    DOMAIN_CHAT_HISTORY_WRITER_PATH,
    JSON.stringify({
      dbFilePath,
      entries,
    }),
  );
}

export async function listDomainChatHistory(params?: {
  domainId?: string;
  userId?: string;
  sessionId?: string;
  limit?: number;
  all?: boolean;
}): Promise<DomainChatHistoryListResult> {
  const dbFilePath = path.resolve(process.cwd(), DOMAIN_CHAT_HISTORY_DB_PATH);
  const stdout = await runNodeScript(
    DOMAIN_CHAT_HISTORY_READER_PATH,
    JSON.stringify({
      dbFilePath,
      domainId: params?.domainId,
      userId: params?.userId,
      sessionId: params?.sessionId,
      limit: params?.limit,
      all: params?.all === true,
    }),
  );

  const payload = JSON.parse(stdout || '{}') as Partial<DomainChatHistoryListResult>;
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    totalCount: typeof payload.totalCount === 'number' ? payload.totalCount : 0,
    limit: typeof payload.limit === 'number' ? payload.limit : params?.limit || 100,
    availableUserIds: Array.isArray(payload.availableUserIds)
      ? payload.availableUserIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    availableSessionIds: Array.isArray(payload.availableSessionIds)
      ? payload.availableSessionIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
  };
}
