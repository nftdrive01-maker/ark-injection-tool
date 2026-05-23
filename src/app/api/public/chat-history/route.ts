import { NextRequest, NextResponse } from 'next/server';
import { getDomainById } from '@/lib/domains';
import { upsertDomainChatHistoryEntries, type DomainChatHistoryEntry } from '@/lib/domain-chat-history';
import {
  createDomainAccessErrorResponse,
  getDomainAccessTokenFromRequest,
  verifyDomainAccessFromToken,
} from '@/lib/domain-access-control';

function isValidEntry(entry: unknown): entry is DomainChatHistoryEntry {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  const value = entry as Record<string, unknown>;
  return (
    typeof value.historyId === 'string' &&
    typeof value.domainId === 'string' &&
    (value.userId === undefined || typeof value.userId === 'string') &&
    (value.role === 'assistant' || value.role === 'system' || value.role === 'user') &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.createdAtDayKey === 'string'
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const entries = Array.isArray(body?.entries) ? body.entries.filter(isValidEntry) : [];

    if (entries.length === 0) {
      return NextResponse.json({ ok: true, upserted: 0 }, { status: 200 });
    }

    const domainAccessToken = getDomainAccessTokenFromRequest(req);
    const domainIds: string[] = Array.from(new Set(entries.map((entry: DomainChatHistoryEntry) => entry.domainId)));
    for (const domainId of domainIds) {
      const accessResult = verifyDomainAccessFromToken(domainId, domainAccessToken);
      if (!accessResult.ok) {
        return createDomainAccessErrorResponse(accessResult.reason);
      }
    }

    const filtered = entries.filter((entry: DomainChatHistoryEntry) => getDomainById(entry.domainId)?.sharedLogEnabled === true);
    await upsertDomainChatHistoryEntries(filtered);

    return NextResponse.json({ ok: true, upserted: filtered.length }, { status: 200 });
  } catch (error) {
    console.error('Public chat history sync error:', error);
    return NextResponse.json({ error: 'チャット履歴同期に失敗しました' }, { status: 500 });
  }
}
