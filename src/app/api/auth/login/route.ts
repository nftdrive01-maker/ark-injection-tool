import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'ユーザー名とパスワードが必須です' }, { status: 400 });
    }

    const token = authenticate(username, password);

    if (!token) {
      return NextResponse.json({ error: 'ユーザー名またはパスワードが正しくありません' }, { status: 401 });
    }

    return NextResponse.json({ token }, { status: 200 });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
