/**
 * 同時接続数管理（インメモリ）
 * 各セッションはハートビートで生存確認を行い、TTL秒以内にハートビートがなければ自動解放
 */

const SESSION_TTL_MS = 60_000; // 60秒間ハートビートがなければ解放
const SWEEP_INTERVAL_MS = 30_000; // 30秒ごとに期限切れセッションを掃除

interface Session {
  domainId: string;
  createdAt: number;
  lastHeartbeat: number;
  attachedPackIds: string[];
}

// プロセス単位のグローバルストア
const sessions = new Map<string, Session>();

// 定期クリーンアップ（サーバー起動時に1回開始）
let sweepStarted = false;
function startSweep() {
  if (sweepStarted) return;
  sweepStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (now - session.lastHeartbeat > SESSION_TTL_MS) {
        sessions.delete(id);
      }
    }
  }, SWEEP_INTERVAL_MS);
}
startSweep();

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 現在のアクティブセッション数（全ドメイン合算） */
export function getActiveCount(): number {
  const now = Date.now();
  let count = 0;
  for (const session of sessions.values()) {
    if (now - session.lastHeartbeat <= SESSION_TTL_MS) {
      count++;
    }
  }
  return count;
}

/**
 * セッション取得を試みる
 * @returns acquired=true のとき sessionId を返す。上限に達していたら acquired=false
 */
export function acquireSession(
  domainId: string,
  maxConcurrent: number,
): { acquired: boolean; sessionId: string | null; current: number } {
  const current = getActiveCount();

  if (maxConcurrent > 0 && current >= maxConcurrent) {
    return { acquired: false, sessionId: null, current };
  }

  const sessionId = generateSessionId();
  const now = Date.now();
  sessions.set(sessionId, {
    domainId,
    createdAt: now,
    lastHeartbeat: now,
    attachedPackIds: [],
  });

  return { acquired: true, sessionId, current: current + 1 };
}

/**
 * セッションのハートビートを更新する（接続維持）
 */
export function heartbeatSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.lastHeartbeat = Date.now();
  return true;
}

function normalizePackId(packId: string): string {
  return (packId || '').trim().toLowerCase();
}

export function getAttachedPackIds(sessionId: string): string[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  return [...session.attachedPackIds];
}

export function getSessionDomainId(sessionId: string): string | undefined {
  const session = sessions.get(sessionId);
  return session?.domainId;
}

export function attachPackToSession(sessionId: string, packId: string): { ok: boolean; attachedPackIds: string[] } {
  const session = sessions.get(sessionId);
  if (!session) {
    return { ok: false, attachedPackIds: [] };
  }

  const normalized = normalizePackId(packId);
  if (!normalized) {
    return { ok: false, attachedPackIds: [...session.attachedPackIds] };
  }

  if (!session.attachedPackIds.includes(normalized)) {
    session.attachedPackIds.push(normalized);
  }

  return { ok: true, attachedPackIds: [...session.attachedPackIds] };
}

export function detachPackFromSession(sessionId: string, packId: string): { ok: boolean; attachedPackIds: string[] } {
  const session = sessions.get(sessionId);
  if (!session) {
    return { ok: false, attachedPackIds: [] };
  }

  const normalized = normalizePackId(packId);
  session.attachedPackIds = session.attachedPackIds.filter((id) => id !== normalized);
  return { ok: true, attachedPackIds: [...session.attachedPackIds] };
}

export function clearAttachedPacks(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.attachedPackIds = [];
  return true;
}

/**
 * セッションを解放する
 */
export function releaseSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * セッションの状態を取得する
 */
export function getSessionStatus(
  maxConcurrent: number,
): { current: number; max: number; available: boolean } {
  const current = getActiveCount();
  const available = maxConcurrent === 0 || current < maxConcurrent;
  return { current, max: maxConcurrent, available };
}
