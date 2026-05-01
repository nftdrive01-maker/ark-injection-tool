import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RuntimeModelResponse = {
  backend: string;
  modelName: string;
  modelSource: 'amica' | 'env' | 'default';
  contextLength: number;
  contextSource: 'api_show' | 'modelfile' | 'metadata' | 'default';
  amicaConfigFetched: boolean;
  ollamaFetched: boolean;
};

function guessDefaultContextLength(modelName: string): number {
  const normalized = modelName.toLowerCase();
  if (
    normalized.includes('32k') ||
    normalized.includes('32768') ||
    normalized.includes('qwen') ||
    normalized.includes('llama3.1') ||
    normalized.includes('mistral-nemo') ||
    normalized.includes('yi')
  ) {
    return 32768;
  }
  return 8192;
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function findContextLengthInObject(obj: unknown): number | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  const directCandidates = [
    (obj as Record<string, unknown>).context_length,
    (obj as Record<string, unknown>).num_ctx,
    (obj as Record<string, unknown>).num_context,
  ];

  for (const candidate of directCandidates) {
    const value = toPositiveNumber(candidate);
    if (value) {
      return value;
    }
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (/context_length|num_ctx|num_context/i.test(key)) {
      const parsed = toPositiveNumber(value);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function parseModelfileContextLength(modelfile: unknown): number | null {
  if (typeof modelfile !== 'string' || !modelfile.trim()) {
    return null;
  }

  const patterns = [
    /PARAMETER\s+num_ctx\s+(\d+)/i,
    /num_ctx\s*=\s*(\d+)/i,
    /context_length\s*=\s*(\d+)/i,
    /context_length\s+(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = modelfile.match(pattern);
    if (match?.[1]) {
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
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

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }
  const token = extractToken(authHeader);
  return !!token && verifyToken(token);
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const amicaBaseUrl = process.env.INJECTION_AMICA_URL || process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';
    const ollamaBaseUrl = process.env.INJECTION_OLLAMA_URL || 'http://127.0.0.1:11434';
    const fallbackModelName = process.env.INJECTION_FALLBACK_MODEL || process.env.NEXT_PUBLIC_OLLAMA_MODEL || 'llama3';

    let backend = 'ollama';
    let modelName = fallbackModelName;
    let modelSource: RuntimeModelResponse['modelSource'] = 'env';
    let amicaConfigFetched = false;

    try {
      const configRes = await fetchWithTimeout(
        `${amicaBaseUrl.replace(/\/$/, '')}/api/dataHandler?type=config`,
        { method: 'GET' },
        2500
      );

      if (configRes.ok) {
        const cfg = await configRes.json();
        if (cfg && typeof cfg === 'object') {
          amicaConfigFetched = true;
          const resolvedBackend =
            typeof (cfg as Record<string, unknown>).chatbot_backend === 'string'
              ? ((cfg as Record<string, unknown>).chatbot_backend as string).toLowerCase()
              : 'ollama';
          backend = resolvedBackend;

          const backendModelKeyMap: Record<string, string> = {
            ollama: 'ollama_model',
            chatgpt: 'openai_model',
            openai: 'openai_model',
            openrouter: 'openrouter_model',
            llamacpp: 'llamacpp_model',
            koboldai: 'koboldai_model',
          };

          const modelKey = backendModelKeyMap[resolvedBackend] || 'ollama_model';
          const modelFromConfig = (cfg as Record<string, unknown>)[modelKey];
          if (typeof modelFromConfig === 'string' && modelFromConfig.trim()) {
            modelName = modelFromConfig.trim();
            modelSource = 'amica';
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch model from Amica config:', err);
    }

    let contextLength: number | null = null;
    let contextSource: RuntimeModelResponse['contextSource'] = 'default';
    let ollamaFetched = false;

    try {
      const showRes = await fetchWithTimeout(
        `${ollamaBaseUrl.replace(/\/$/, '')}/api/show`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName }),
        },
        3000
      );

      if (showRes.ok) {
        ollamaFetched = true;
        const showData = await showRes.json();

        const fromTopLevel = findContextLengthInObject(showData);
        if (fromTopLevel) {
          contextLength = fromTopLevel;
          contextSource = 'api_show';
        }

        if (!contextLength && showData && typeof showData === 'object') {
          const showObj = showData as Record<string, unknown>;

          const fromDetails = findContextLengthInObject(showObj.details);
          if (fromDetails) {
            contextLength = fromDetails;
            contextSource = 'api_show';
          }

          if (!contextLength) {
            const fromModelInfo = findContextLengthInObject(showObj.model_info);
            if (fromModelInfo) {
              contextLength = fromModelInfo;
              contextSource = 'metadata';
            }
          }

          if (!contextLength) {
            const fromMetadata = findContextLengthInObject(showObj.metadata);
            if (fromMetadata) {
              contextLength = fromMetadata;
              contextSource = 'metadata';
            }
          }

          if (!contextLength) {
            const fromModelfile = parseModelfileContextLength(showObj.modelfile);
            if (fromModelfile) {
              contextLength = fromModelfile;
              contextSource = 'modelfile';
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch context length from Ollama:', err);
    }

    if (!contextLength) {
      contextLength = guessDefaultContextLength(modelName);
      contextSource = 'default';
    }

    const payload: RuntimeModelResponse = {
      backend,
      modelName,
      modelSource,
      contextLength,
      contextSource,
      amicaConfigFetched,
      ollamaFetched,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error('Runtime model API error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
