import { NextRequest, NextResponse } from 'next/server';
import { getChronicleById, getDomainOptions } from '@/lib/domains';

const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_AMICA_ORIGIN || 'http://localhost:3000';

/**
 * リクエストから injection-tool 自身のオリジンを解決する。
 * 環境変数 NEXT_PUBLIC_INJECTION_TOOL_ORIGIN が設定されていればそちらを優先する
 * （外部公開・リバースプロキシ環境向け）。
 * 未設定の場合は X-Forwarded-Proto/Host または request.url から導出する。
 */
function resolveInjectionOrigin(req: NextRequest): string {
  const envOrigin = process.env.NEXT_PUBLIC_INJECTION_TOOL_ORIGIN?.trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');

  // X-Forwarded-* ヘッダーがあればリバースプロキシ越しのオリジンを使う
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  return `${proto}://${host}`;
}

/**
 * 相対 URL（/vrm/... や /bgimage/...）を injection-tool のオリジンを含む絶対 URL に変換する。
 * 既に http(s):// で始まる絶対 URL はそのまま返す。
 */
function toAbsoluteAssetUrl(url: string | undefined, origin: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function GET(req: NextRequest) {
  try {
    const origin = resolveInjectionOrigin(req);
    const rawDomains = getDomainOptions();

    // アセット URL を injection-tool の絶対 URL に変換してから返す
    const domains = rawDomains
      .filter((d) => d.enabled !== false)
      .map((d) => ({
        ...d,
        chronicleAttached: Array.isArray(d.chronicleIds) && d.chronicleIds.some((id) => {
          const chronicle = getChronicleById(id);
          return Boolean(chronicle && chronicle.enabled);
        }),
        mcpServerIds: Array.isArray(d.mcpServerIds) ? d.mcpServerIds : [],
        knowledgeIds: Array.isArray(d.knowledgeIds) ? d.knowledgeIds : [],
        vrmUrl: toAbsoluteAssetUrl(d.vrmUrl, origin),
        bgUrl: toAbsoluteAssetUrl(d.bgUrl, origin),
        imageAvatarIdleUrl: toAbsoluteAssetUrl(d.imageAvatarIdleUrl, origin),
        imageAvatarTalkUrl: toAbsoluteAssetUrl(d.imageAvatarTalkUrl, origin),
      }));

    return NextResponse.json(
      {
        domains,
        defaultDomainId: process.env.INJECTION_DEFAULT_DOMAIN_ID || 'default',
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': CLIENT_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-domain-access-token',
        },
      }
    );
  } catch {
    return NextResponse.json({ domains: [], defaultDomainId: null }, { status: 200 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': CLIENT_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-domain-access-token',
      'Access-Control-Max-Age': '86400',
    },
  });
}
