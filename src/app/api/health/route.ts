import { NextResponse } from 'next/server';
import { HealthCheckResponse } from '@/types/injection';

const AMICA_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

export async function GET() {
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': AMICA_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': AMICA_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}
