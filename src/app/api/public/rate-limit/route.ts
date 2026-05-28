import { NextResponse } from 'next/server';
import {
  getDerivedGlobalChatRequestsPerMinute,
  getPublicManagementSettings,
  getDerivedGlobalTtsRequestsPerMinute,
} from '@/lib/public-management';

const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CLIENT_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const settings = getPublicManagementSettings();
  return NextResponse.json(
    {
      maxConcurrentSessions: settings.maxConcurrentSessions,
      chatRequestsPerUserPerMinute: settings.chatRequestsPerUserPerMinute,
      ttsRequestsPerUserPerMinute: settings.ttsRequestsPerUserPerMinute,
      globalChatRequestsPerMinute: getDerivedGlobalChatRequestsPerMinute(settings),
      globalTtsRequestsPerMinute: getDerivedGlobalTtsRequestsPerMinute(settings),
    },
    { status: 200, headers: CORS_HEADERS }
  );
}