import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth';
import { fetchStyleBertVits2Upstream } from '@/lib/stylebertvits2';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = extractToken(authHeader);
  return !!token && verifyToken(token);
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const modelId = typeof body?.modelId === 'string' && body.modelId.trim() ? body.modelId.trim() : '0';
    const style = typeof body?.style === 'string' && body.style.trim() ? body.style.trim() : 'Neutral';

    if (!text) {
      return NextResponse.json({ error: 'テキストが空です' }, { status: 400 });
    }

    const params = new URLSearchParams({
      text,
      model_id: modelId,
      style,
    });

    const { response: upstream } = await fetchStyleBertVits2Upstream(`/voice?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const rawError = await upstream.text().catch(() => '');
      return NextResponse.json(
        {
          error:
            rawError && rawError.trim()
              ? rawError.slice(0, 500)
              : `SBV2音声生成に失敗しました (${upstream.status})`,
        },
        { status: upstream.status }
      );
    }

    const audioBuffer = await upstream.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/wav',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Style-Bert-VITS2 preview API error:', err);
    return NextResponse.json(
      { error: 'SBV2テスト再生中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
