import { NextRequest, NextResponse } from 'next/server';
import { hasValidSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  return NextResponse.json({ authenticated: hasValidSession(req) }, { status: 200 });
}