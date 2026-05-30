import fs from 'fs';
import path from 'path';

export type AdminLoginHistoryRecord = {
  timestamp: string;
  ip: string;
  success: boolean;
};

const ADMIN_LOGIN_HISTORY_LOG_PATH = process.env.INJECTION_ADMIN_LOGIN_HISTORY_LOG_PATH || './data/admin-login-history.jsonl';

function ensureDirectory(filePath: string): void {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeIp(ip: string): string {
  return String(ip || '').trim() || 'unknown';
}

export function writeAdminLoginHistory(ip: string): void {
  writeAdminLoginHistoryRecord({
    ip,
    success: true,
  });
}

export function writeAdminLoginHistoryRecord(input: { ip: string; success: boolean }): void {
  const record: AdminLoginHistoryRecord = {
    timestamp: new Date().toISOString(),
    ip: sanitizeIp(input.ip),
    success: input.success === true,
  };

  try {
    const fullPath = path.resolve(process.cwd(), ADMIN_LOGIN_HISTORY_LOG_PATH);
    ensureDirectory(fullPath);
    fs.appendFileSync(fullPath, `${JSON.stringify(record)}\n`, 'utf-8');
  } catch {
    // Do not break login flow on history logging failure.
  }
}

export function readAdminLoginHistory(limit = 100): AdminLoginHistoryRecord[] {
  try {
    const fullPath = path.resolve(process.cwd(), ADMIN_LOGIN_HISTORY_LOG_PATH);
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const records = lines
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as Partial<AdminLoginHistoryRecord>;
          if (typeof parsed.timestamp !== 'string' || typeof parsed.ip !== 'string') {
            return null;
          }

          return {
            timestamp: parsed.timestamp,
            ip: sanitizeIp(parsed.ip),
            success: parsed.success !== false,
          } satisfies AdminLoginHistoryRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is AdminLoginHistoryRecord => record !== null);

    return records.slice(-Math.max(0, limit)).reverse();
  } catch {
    return [];
  }
}

export function clearAdminLoginHistory(): void {
  try {
    const fullPath = path.resolve(process.cwd(), ADMIN_LOGIN_HISTORY_LOG_PATH);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // Keep admin UI responsive even if log cleanup fails.
  }
}