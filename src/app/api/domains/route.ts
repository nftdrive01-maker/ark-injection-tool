import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { createDomain, getAllDomains } from '@/lib/domains';
import { prepareDomainAccessUsersForSave } from '@/lib/domain-access-auth';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const domains = getAllDomains();
    return NextResponse.json(domains, { status: 200 });
  } catch (err) {
    console.error('Get domains error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
    }

    const token = extractToken(authHeader);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const body = await req.json();
    if (!body?.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'ドメイン名が必須です' }, { status: 400 });
    }

    const created = createDomain({
      name: body.name.trim(),
      description: body.description,
      sharedLogEnabled: body.sharedLogEnabled,
      accessControlEnabled: body.accessControlEnabled,
      accessUsers: prepareDomainAccessUsersForSave(body.accessUsers, []),
      baseSystemPrompt: body.baseSystemPrompt,
      baseContext: body.baseContext,
      bgUrl: body.bgUrl,
      themeColor: body.themeColor,
      characterName: body.characterName,
      vrmEnabled: body.vrmEnabled,
      vrmUrl: body.vrmUrl,
      imageAvatarIdleUrl: body.imageAvatarIdleUrl,
      imageAvatarTalkUrl: body.imageAvatarTalkUrl,
      imageAvatarTalkIntervalMs: body.imageAvatarTalkIntervalMs,
      stylebertvits2ModelId: body.stylebertvits2ModelId,
      stylebertvits2Style: body.stylebertvits2Style,
      gazeWakeEnabled: body.gazeWakeEnabled,
      gazeHoldMs: body.gazeHoldMs,
      gazeReleaseMs: body.gazeReleaseMs,
      gazeCooldownMs: body.gazeCooldownMs,
      gazeGreetings: body.gazeGreetings,
      knowledgeIds: body.knowledgeIds,
      chronicleIds: body.chronicleIds,
      ttl: body.ttl,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('Create domain error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
