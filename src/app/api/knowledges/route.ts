import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { createKnowledge, getAllKnowledges } from '@/lib/domains';

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

    const knowledges = getAllKnowledges();
    return NextResponse.json(knowledges, { status: 200 });
  } catch (err) {
    console.error('Get knowledges error:', err);
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
      return NextResponse.json({ error: 'ナレッジ名が必須です' }, { status: 400 });
    }

    const created = createKnowledge({
      name: body.name.trim(),
      description: body.description,
      systemPrompt: body.systemPrompt,
      context: body.context,
      enabled: body.enabled,
      priority: body.priority,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('Create knowledge error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
