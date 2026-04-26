import { NextResponse } from 'next/server';
import { getDomainOptions } from '@/lib/domains';

const AMICA_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

export async function GET() {
  try {
    const domains = getDomainOptions();
    return NextResponse.json(
      {
        domains,
        defaultDomainId: process.env.INJECTION_DEFAULT_DOMAIN_ID || 'default',
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': AMICA_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ domains: [], defaultDomainId: null }, { status: 200 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': AMICA_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
