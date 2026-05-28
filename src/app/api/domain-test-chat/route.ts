import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { type Domain, getDomainById } from '@/lib/domains';
import { buildInterceptResponse } from '@/lib/intercept-service';

type RuntimeModelInfo = {
  backend: string;
  modelName: string;
};

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return Boolean(token && verifyToken(token));
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function coerceDraftDomain(raw: unknown, fallback?: Domain | null): Domain | null {
  if (!raw || typeof raw !== 'object') {
    return fallback || null;
  }

  const source = raw as Record<string, unknown>;
  const merged = {
    ...(fallback || {}),
    ...source,
  } as Record<string, unknown>;

  const id = typeof merged.id === 'string' ? merged.id.trim() : '';
  const name = typeof merged.name === 'string' ? merged.name.trim() : '';

  if (!id || !name) {
    return fallback || null;
  }

  return {
    id,
    name,
    description: typeof merged.description === 'string' ? merged.description : fallback?.description || '',
    enabled: merged.enabled === undefined ? fallback?.enabled : Boolean(merged.enabled),
    sharedLogEnabled: merged.sharedLogEnabled === undefined ? fallback?.sharedLogEnabled : Boolean(merged.sharedLogEnabled),
    accessControlEnabled: merged.accessControlEnabled === undefined ? fallback?.accessControlEnabled : Boolean(merged.accessControlEnabled),
    accessUsers: Array.isArray(merged.accessUsers) ? (merged.accessUsers as Domain['accessUsers']) : fallback?.accessUsers,
    baseSystemPrompt: typeof merged.baseSystemPrompt === 'string' ? merged.baseSystemPrompt : fallback?.baseSystemPrompt || '',
    baseContext: typeof merged.baseContext === 'string' ? merged.baseContext : fallback?.baseContext || '',
    bgUrl: typeof merged.bgUrl === 'string' ? merged.bgUrl : fallback?.bgUrl,
    themeColor: typeof merged.themeColor === 'string' ? merged.themeColor : fallback?.themeColor,
    characterName: typeof merged.characterName === 'string' ? merged.characterName : fallback?.characterName,
    vrmEnabled: merged.vrmEnabled === undefined ? fallback?.vrmEnabled : Boolean(merged.vrmEnabled),
    vrmUrl: typeof merged.vrmUrl === 'string' ? merged.vrmUrl : fallback?.vrmUrl,
    stylebertvits2ModelId: typeof merged.stylebertvits2ModelId === 'string' ? merged.stylebertvits2ModelId : fallback?.stylebertvits2ModelId,
    stylebertvits2Style: typeof merged.stylebertvits2Style === 'string' ? merged.stylebertvits2Style : fallback?.stylebertvits2Style,
    ttsMuted: typeof merged.ttsMuted === 'boolean' ? merged.ttsMuted : fallback?.ttsMuted,
    gazeWakeEnabled: typeof merged.gazeWakeEnabled === 'boolean' ? merged.gazeWakeEnabled : fallback?.gazeWakeEnabled,
    gazeHoldMs: typeof merged.gazeHoldMs === 'number' ? merged.gazeHoldMs : fallback?.gazeHoldMs,
    gazeReleaseMs: typeof merged.gazeReleaseMs === 'number' ? merged.gazeReleaseMs : fallback?.gazeReleaseMs,
    gazeCooldownMs: typeof merged.gazeCooldownMs === 'number' ? merged.gazeCooldownMs : fallback?.gazeCooldownMs,
    gazeGreetings: Array.isArray(merged.gazeGreetings) ? (merged.gazeGreetings as string[]) : fallback?.gazeGreetings,
    gazeDebugUiEnabled: typeof merged.gazeDebugUiEnabled === 'boolean' ? merged.gazeDebugUiEnabled : fallback?.gazeDebugUiEnabled,
    imageAvatarIdleUrl: typeof merged.imageAvatarIdleUrl === 'string' ? merged.imageAvatarIdleUrl : fallback?.imageAvatarIdleUrl,
    imageAvatarTalkUrl: typeof merged.imageAvatarTalkUrl === 'string' ? merged.imageAvatarTalkUrl : fallback?.imageAvatarTalkUrl,
    imageAvatarTalkIntervalMs: typeof merged.imageAvatarTalkIntervalMs === 'number' ? merged.imageAvatarTalkIntervalMs : fallback?.imageAvatarTalkIntervalMs,
    knowledgeIds: normalizeStringArray(merged.knowledgeIds) || fallback?.knowledgeIds || [],
    mcpServerIds: normalizeStringArray(merged.mcpServerIds) || fallback?.mcpServerIds,
    chronicleIds: normalizeStringArray(merged.chronicleIds) || fallback?.chronicleIds,
    memoryIds: normalizeStringArray(merged.memoryIds) || fallback?.memoryIds,
    version: typeof merged.version === 'string' && merged.version.trim() ? merged.version : fallback?.version || new Date().toISOString(),
    ttl: typeof merged.ttl === 'number' && Number.isFinite(merged.ttl) ? merged.ttl : fallback?.ttl || 3600,
  };
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveRuntimeModel(): Promise<RuntimeModelInfo> {
  const amicaBaseUrl = process.env.INJECTION_AMICA_URL || process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';
  const fallbackModelName = process.env.INJECTION_FALLBACK_MODEL || process.env.NEXT_PUBLIC_OLLAMA_MODEL || 'llama3';

  let backend = 'ollama';
  let modelName = fallbackModelName;

  try {
    const configRes = await fetchWithTimeout(
      `${amicaBaseUrl.replace(/\/$/, '')}/api/dataHandler?type=config`,
      { method: 'GET' },
      2500,
    );

    if (configRes.ok) {
      const cfg = await configRes.json();
      if (cfg && typeof cfg === 'object') {
        const resolvedBackend =
          typeof (cfg as Record<string, unknown>).chatbot_backend === 'string'
            ? ((cfg as Record<string, unknown>).chatbot_backend as string).toLowerCase()
            : 'ollama';

        const backendModelKeyMap: Record<string, string> = {
          ollama: 'ollama_model',
          chatgpt: 'openai_model',
          openai: 'openai_model',
          openrouter: 'openrouter_model',
          llamacpp: 'llamacpp_model',
          koboldai: 'koboldai_model',
        };

        backend = resolvedBackend;
        const modelKey = backendModelKeyMap[resolvedBackend] || 'ollama_model';
        const modelFromConfig = (cfg as Record<string, unknown>)[modelKey];
        if (typeof modelFromConfig === 'string' && modelFromConfig.trim()) {
          modelName = modelFromConfig.trim();
        }
      }
    }
  } catch (error) {
    console.warn('Failed to resolve preview model from Amica config:', error);
  }

  return { backend, modelName };
}

function normalizeHistory(raw: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const role = (item as Record<string, unknown>).role;
      const content = (item as Record<string, unknown>).content;
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
        return null;
      }

      return {
        role,
        content: content.trim(),
      };
    })
    .filter((item): item is { role: 'user' | 'assistant'; content: string } => Boolean(item))
    .slice(-12);
}

async function callPreviewModel(params: {
  modelName: string;
  systemPrompt: string;
  userText: string;
  messageHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  const ollamaBaseUrl = process.env.INJECTION_OLLAMA_URL || 'http://127.0.0.1:11434';
  const response = await fetchWithTimeout(
    `${ollamaBaseUrl.replace(/\/$/, '')}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.modelName,
        stream: false,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messageHistory,
          { role: 'user', content: params.userText },
        ],
      }),
    },
    120000,
  );

  const payload = await response.json().catch(() => null) as
    | { message?: { content?: string }; response?: string; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : `Ollama へのテスト問い合わせに失敗しました (${response.status})`);
  }

  const content = typeof payload?.message?.content === 'string'
    ? payload.message.content.trim()
    : typeof payload?.response === 'string'
      ? payload.response.trim()
      : '';

  if (!content) {
    throw new Error('モデル応答が空でした');
  }

  return content;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const userText = typeof body?.userText === 'string' ? body.userText.trim() : '';
    if (!userText) {
      return NextResponse.json({ error: 'テストメッセージを入力してください' }, { status: 400 });
    }

    const requestedDomainId = typeof body?.domainId === 'string' ? body.domainId.trim() : '';
    const fallbackDomain = requestedDomainId ? getDomainById(requestedDomainId) : null;
    const domain = coerceDraftDomain(body?.draftDomain, fallbackDomain);

    if (!domain) {
      return NextResponse.json({ error: '対象ドメインが見つかりません' }, { status: 404 });
    }

    const sessionId = typeof body?.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : `admin-preview-${domain.id}`;

    const interceptResponse = await buildInterceptResponse({
      body: {
        userText,
        domainId: domain.id,
        sessionId,
        messageHistory: normalizeHistory(body?.messageHistory),
      },
      domain,
      userId: 'admin-preview',
      sessionId,
      persistSharedLog: false,
    });

    const runtimeModel = await resolveRuntimeModel();
    if (runtimeModel.backend !== 'ollama') {
      return NextResponse.json(
        {
          error: `管理画面テストチャットは現在 ollama backend のみ対応しています。現在の backend: ${runtimeModel.backend}`,
          intercept: interceptResponse,
          backend: runtimeModel.backend,
          modelName: runtimeModel.modelName,
        },
        { status: 501 },
      );
    }

    const assistantMessage = await callPreviewModel({
      modelName: runtimeModel.modelName,
      systemPrompt: interceptResponse.injectedSystemPrompt || '',
      userText,
      messageHistory: normalizeHistory(body?.messageHistory),
    });

    return NextResponse.json(
      {
        assistantMessage,
        backend: runtimeModel.backend,
        modelName: runtimeModel.modelName,
        intercept: interceptResponse,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Domain test chat API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'テストチャットの実行に失敗しました',
      },
      { status: 500 },
    );
  }
}