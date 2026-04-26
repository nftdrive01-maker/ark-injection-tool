import { NextRequest, NextResponse } from 'next/server';
import { getPublicPronunciationRules } from '@/lib/pronunciations';

const AMICA_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  try {
    const domainId = req.nextUrl.searchParams.get('domainId') || undefined;
    const rules = getPublicPronunciationRules(domainId).map((rule) => ({
      id: rule.id,
      from: rule.from,
      to: rule.to,
      priority: rule.priority,
      domainId: rule.domainId,
    }));

    return NextResponse.json(
      {
        rules,
        updatedAt: new Date().toISOString(),
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
    return NextResponse.json(
      {
        rules: [],
        updatedAt: new Date().toISOString(),
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
