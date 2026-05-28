import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return !!token && verifyToken(token);
}

function getPiperBaseUrlCandidates(): string[] {
  const rawCandidates = [
    process.env.PIPER_URL,
    process.env.NEXT_PUBLIC_PIPER_URL,
    'http://piper:8000',
    'http://host.docker.internal:5001',
    'http://127.0.0.1:5001',
  ];

  const candidates: string[] = [];
  for (const rawCandidate of rawCandidates) {
    if (typeof rawCandidate !== 'string' || !rawCandidate.trim()) {
      continue;
    }

    const normalized = rawCandidate.trim().replace(/\/$/, '');
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }

    if (normalized.includes('//localhost:')) {
      const fallback = normalized.replace('//localhost', '//host.docker.internal');
      if (!candidates.includes(fallback)) {
        candidates.push(fallback);
      }
    }

    if (normalized.includes('//127.0.0.1:')) {
      const fallback = normalized.replace('//127.0.0.1', '//host.docker.internal');
      if (!candidates.includes(fallback)) {
        candidates.push(fallback);
      }
    }
  }

  return candidates;
}

async function fetchPiperPreview(text: string): Promise<Response> {
  const language = (process.env.PIPER_DEFAULT_LANGUAGE || 'ja-en-zh-es-fr-pt').trim() || 'ja-en-zh-es-fr-pt';
  const lengthScale = Number(process.env.PIPER_LENGTH_SCALE || '1.0');
  const noiseScale = Number(process.env.PIPER_NOISE_SCALE || '0.667');
  const noiseW = Number(process.env.PIPER_NOISE_W || '0.8');
  const resolvedLengthScale = Number.isFinite(lengthScale) && lengthScale > 0 ? lengthScale : 1.0;
  const candidates = getPiperBaseUrlCandidates();
  const errors: string[] = [];

  for (const baseUrl of candidates) {
    try {
      const url = new URL('/synthesize', `${baseUrl}/`);
      url.searchParams.set('text', text);
      url.searchParams.set('language', language);
      url.searchParams.set('speaker_id', '0');
      url.searchParams.set('noise_scale', String(noiseScale));
      url.searchParams.set('length_scale', String(resolvedLengthScale));
      url.searchParams.set('noise_w', String(noiseW));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'audio/wav',
        },
        cache: 'no-store',
      });

      if (response.ok) {
        return response;
      }

      const rawError = await response.text().catch(() => '');
      errors.push(`${baseUrl}: ${rawError || `${response.status} ${response.statusText}`}`);
    } catch (error) {
      errors.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.length > 0 ? errors.join(' | ') : 'Piper upstream is unavailable');
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'テキストが空です' }, { status: 400 });
    }

    const upstream = await fetchPiperPreview(text);
    const audioBuffer = await upstream.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/wav',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Piper preview API error:', err);
    return NextResponse.json(
      { error: 'Piperテスト再生中にエラーが発生しました' },
      { status: 500 },
    );
  }
}