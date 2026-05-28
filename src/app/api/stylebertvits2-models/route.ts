import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { fetchStyleBertVits2Upstream } from '@/lib/stylebertvits2';

type RawSbv2Model = {
  config_path?: string;
  model_path?: string;
  spk2id?: Record<string, number>;
};

type Sbv2ModelOption = {
  id: string;
  name: string;
  speakerNames: string[];
  speakerCount: number;
  isMultiSpeaker: boolean;
};

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return !!token && verifyToken(token);
}

function normalizeName(modelId: string, model: RawSbv2Model): string {
  if (typeof model.config_path === 'string' && model.config_path.trim()) {
    const normalized = model.config_path.replace(/\\/g, '/').trim();
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return segments[segments.length - 2];
    }
  }
  return modelId;
}

function toModelOptions(payload: unknown): Sbv2ModelOption[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const entries = Object.entries(payload as Record<string, RawSbv2Model>);

  return entries
    .map(([modelId, model]) => {
      const speakerNames = model?.spk2id && typeof model.spk2id === 'object'
        ? Object.keys(model.spk2id)
        : [];

      return {
        id: String(modelId),
        name: normalizeName(String(modelId), model || {}),
        speakerNames,
        speakerCount: speakerNames.length,
        isMultiSpeaker: speakerNames.length > 1,
      };
    })
    .sort((a, b) => {
      const numA = Number(a.id);
      const numB = Number(b.id);
      const numericA = Number.isFinite(numA);
      const numericB = Number.isFinite(numB);

      if (numericA && numericB) {
        return numA - numB;
      }
      if (numericA) {
        return -1;
      }
      if (numericB) {
        return 1;
      }
      return a.id.localeCompare(b.id, 'ja');
    });
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const { response: upstream, sourceBaseUrl } = await fetchStyleBertVits2Upstream('/models/info', {
      method: 'GET',
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          models: [],
          source: sourceBaseUrl,
          error: `SBV2モデル一覧の取得に失敗しました (${upstream.status})`,
        },
        { status: 200 }
      );
    }

    const raw = await upstream.json();
    const models = toModelOptions(raw);

    return NextResponse.json({ models, source: sourceBaseUrl }, { status: 200 });
  } catch (err) {
    console.error('Style-Bert-VITS2 models API error:', err);
    return NextResponse.json(
      {
        models: [],
        error: err instanceof Error ? `SBV2モデル一覧の取得中にエラーが発生しました: ${err.message}` : 'SBV2モデル一覧の取得中にエラーが発生しました',
      },
      { status: 200 }
    );
  }
}
