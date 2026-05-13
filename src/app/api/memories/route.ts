import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { callBeyondCoreTool } from '@/lib/beyond-core-client';
import { getAllChronicles } from '@/lib/domains';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

export interface BeyondCoreMemory {
  id: number | string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BeyondCoreMemoryExport extends BeyondCoreMemory {
  item_count?: number;
  items?: Array<{
    id?: number;
    memory_id?: number;
    title?: string;
    block_height?: number;
    network?: string;
    verified?: number | boolean;
    source_type?: string;
    summary?: string;
    saved_at?: string;
  }>;
}

export interface MemoryWithOnchainInfo extends BeyondCoreMemory {
  block_height?: number;
  network?: string;
  summary?: string;
  item_count?: number;
}

function normalizeMemory(raw: any): BeyondCoreMemory {
  const activeValue = raw?.active ?? raw?.is_active;
  return {
    id: raw?.id,
    name: typeof raw?.name === 'string' ? raw.name : '',
    description: typeof raw?.description === 'string' ? raw.description : '',
    active: activeValue === true || activeValue === 1 || activeValue === '1',
    created_at: typeof raw?.created_at === 'string' ? raw.created_at : '',
    updated_at: typeof raw?.updated_at === 'string' ? raw.updated_at : '',
  };
}

function enrichMemoryWithOnchainInfo(raw: BeyondCoreMemoryExport): MemoryWithOnchainInfo {
  const base = normalizeMemory(raw);
  const items = Array.isArray(raw?.items) ? raw.items : [];
  
  // Get the highest block height from items
  const blockHeight = items.length > 0
    ? Math.max(...items.map((item: any) => item?.block_height || 0).filter((h: number) => h > 0))
    : undefined;
  
  // Get the first item's summary
  const summary = items.length > 0 ? items[0]?.summary || '' : '';
  
  // Get network from the first item
  const network = items.length > 0 ? items[0]?.network : undefined;
  
  return {
    ...base,
    block_height: blockHeight || undefined,
    network,
    summary: summary.length > 300 ? summary.substring(0, 300) + '...' : summary,
    item_count: raw?.item_count || items.length,
  };
}

function buildBeyondCoreMemoriesUrl(host: string, apiPort: number): string {
  const normalizedHost = host.startsWith('http://') || host.startsWith('https://')
    ? host
    : `http://${host}`;
  return `${normalizedHost}:${apiPort}/api/memories`;
}

function buildBeyondCoreMemoriesExportUrl(host: string, apiPort: number): string {
  const normalizedHost = host.startsWith('http://') || host.startsWith('https://')
    ? host
    : `http://${host}`;
  return `${normalizedHost}:${apiPort}/api/memories/export`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const chronicleId = req.nextUrl.searchParams.get('chronicleId') || undefined;
    const shouldExport = req.nextUrl.searchParams.get('export') === 'true';

    // Get chronicles to determine which one to use
    const chronicles = getAllChronicles();
    if (chronicles.length === 0) {
      return NextResponse.json({ memories: [] }, { status: 200 });
    }

    // Use the requested chronicle when provided, otherwise fallback to enabled/first
    const chronicle = chronicleId
      ? chronicles.find((c) => c.id === chronicleId)
      : (chronicles.find((c) => c.enabled) || chronicles[0]);
    if (!chronicle) {
      return NextResponse.json({ error: '指定されたCHRONICLEが見つかりません' }, { status: 404 });
    }

    // Choose the appropriate endpoint based on the export flag
    const memoriesUrl = shouldExport
      ? buildBeyondCoreMemoriesExportUrl(chronicle.host, chronicle.apiPort)
      : buildBeyondCoreMemoriesUrl(chronicle.host, chronicle.apiPort);
    
    const response = await fetch(memoriesUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        { error: `BEYOND Core ${memoriesUrl} 呼び出しに失敗しました: ${response.status} ${errorText}` },
        { status: 502 }
      );
    }

    const payload = await response.json().catch(() => null);
    const rawMemories = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.memories)
        ? payload.memories
        : [];
    
    const memories = shouldExport
      ? rawMemories.map((item) => enrichMemoryWithOnchainInfo(item))
      : rawMemories.map((item) => normalizeMemory(item));

    return NextResponse.json({ memories }, { status: 200 });
  } catch (err) {
    console.error('Get memories error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const memoryId = body?.memoryId;
    const active = body?.active;
    const chronicleId = typeof body?.chronicleId === 'string' ? body.chronicleId : undefined;

    if (memoryId === undefined || typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'memoryId と active は必須です' },
        { status: 400 }
      );
    }

    const chronicles = getAllChronicles();
    if (chronicleId) {
      const chronicle = chronicles.find((item) => item.id === chronicleId);
      if (!chronicle) {
        return NextResponse.json({ error: '指定されたCHRONICLEが見つかりません' }, { status: 404 });
      }

      const result = await callBeyondCoreTool({
        host: chronicle.host,
        tcpPort: chronicle.tcpPort,
        toolName: 'memory_update',
        args: {
          memory_id: memoryId,
          active,
        },
        timeoutMs: 10000,
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: result.error || 'メモリー状態の更新に失敗しました' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    const chronicle = chronicles.find((item) => item.enabled) || chronicles[0];
    if (!chronicle) {
      return NextResponse.json({ error: 'CHRONICLEが見つかりません' }, { status: 404 });
    }

    const result = await callBeyondCoreTool({
      host: chronicle.host,
      tcpPort: chronicle.tcpPort,
      toolName: 'memory_update',
      args: {
        memory_id: memoryId,
        active,
      },
      timeoutMs: 10000,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'メモリー状態の更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Update memories error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
