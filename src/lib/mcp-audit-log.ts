import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type MCPAuditErrorCode =
  | 'NONE'
  | 'TOOL_SELECTION_NO_MATCH'
  | 'TOOL_NOT_IMPLEMENTED'
  | 'TOOL_NOT_ALLOWED'
  | 'MCP_CALL_ERROR'
  | 'MCP_NO_ELIGIBLE_SERVER'
  | 'SERVER_NOT_FOUND'
  | 'SERVER_DISABLED';

export type MCPAuditRecord = {
  requestId: string;
  sessionId: string;
  userId: string;
  timestamp: string;
  attachedPackIds: string[];
  toolName: string;
  targetKind: 'gmail' | 'calendar' | 'drive' | 'other';
  success: boolean;
  errorCode: MCPAuditErrorCode;
  resultCount: number;
  contentHash: string;
};

const AUDIT_LOG_PATH = process.env.INJECTION_MCP_AUDIT_LOG_PATH || './data/mcp-audit.jsonl';

function ensureDirectory(filePath: string): void {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeMultiline(value: string): string {
  return (value || '').replace(/\r?\n/g, ' ').trim();
}

function toTargetKind(toolName: string): MCPAuditRecord['targetKind'] {
  const t = (toolName || '').toLowerCase();
  if (t.includes('gmail') || t.includes('mail')) return 'gmail';
  if (t.includes('calendar') || t.includes('event')) return 'calendar';
  if (t.includes('drive') || t.includes('file')) return 'drive';
  return 'other';
}

function countTopLevelItems(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') return 1;
    return 1;
  } catch {
    return 1;
  }
}

function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function writeMCPAuditLog(input: {
  requestId: string;
  sessionId?: string;
  userId?: string;
  attachedPackIds?: string[];
  toolName?: string;
  success: boolean;
  errorCode?: MCPAuditErrorCode;
  output?: string;
}): void {
  const outputText = sanitizeMultiline(input.output || '');
  const record: MCPAuditRecord = {
    requestId: input.requestId,
    sessionId: input.sessionId || 'unknown-session',
    userId: input.userId || 'anonymous:unknown-session',
    timestamp: new Date().toISOString(),
    attachedPackIds: Array.isArray(input.attachedPackIds) ? input.attachedPackIds : [],
    toolName: sanitizeMultiline(input.toolName || 'unknown-tool'),
    targetKind: toTargetKind(input.toolName || ''),
    success: input.success,
    errorCode: input.errorCode || (input.success ? 'NONE' : 'MCP_CALL_ERROR'),
    resultCount: countTopLevelItems(outputText),
    contentHash: hashContent(outputText),
  };

  try {
    const fullPath = path.resolve(process.cwd(), AUDIT_LOG_PATH);
    ensureDirectory(fullPath);
    fs.appendFileSync(fullPath, `${JSON.stringify(record)}\n`, 'utf-8');
  } catch {
    // Do not break chat flow on audit logging failure.
  }
}
