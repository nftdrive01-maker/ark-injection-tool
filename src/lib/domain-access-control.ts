import { NextRequest, NextResponse } from 'next/server';
import { getDomainById } from './domains';
import {
  issueDomainAccessToken,
  sanitizeDomainAccessUsername,
  verifyDomainAccessPassword,
  verifyDomainAccessToken,
} from './domain-access-auth';

export const DOMAIN_ACCESS_HEADER = 'x-domain-access-token';

export type DomainAccessResult =
  | { ok: true; username?: string }
  | { ok: false; reason: 'DOMAIN_NOT_FOUND' | 'DOMAIN_AUTH_REQUIRED' };

export function verifyDomainUserCredentials(domainId: string, username: string, password: string): DomainAccessResult {
  const domain = getDomainById(domainId);
  if (!domain) {
    return { ok: false, reason: 'DOMAIN_NOT_FOUND' };
  }

  if (domain.accessControlEnabled !== true) {
    return { ok: true };
  }

  const normalizedUsername = sanitizeDomainAccessUsername(username);
  const matchedUser = (domain.accessUsers || []).find((user) => user.username === normalizedUsername);
  if (!matchedUser || !verifyDomainAccessPassword(password, matchedUser.passwordHash)) {
    return { ok: false, reason: 'DOMAIN_AUTH_REQUIRED' };
  }

  return { ok: true, username: matchedUser.username };
}

export function issueDomainTokenForUser(domainId: string, username: string): string {
  return issueDomainAccessToken(domainId, username);
}

export function verifyDomainAccessFromToken(domainId: string, token: string | null | undefined): DomainAccessResult {
  const domain = getDomainById(domainId);
  if (!domain) {
    return { ok: false, reason: 'DOMAIN_NOT_FOUND' };
  }

  if (domain.accessControlEnabled !== true) {
    return { ok: true };
  }

  const verification = verifyDomainAccessToken(domainId, String(token || '').trim());
  if (!verification.valid) {
    return { ok: false, reason: 'DOMAIN_AUTH_REQUIRED' };
  }

  return { ok: true, username: verification.username };
}

export function getDomainAccessTokenFromRequest(req: NextRequest): string {
  return (req.headers.get(DOMAIN_ACCESS_HEADER) || '').trim();
}

export function createDomainAccessErrorResponse(
  reason: 'DOMAIN_NOT_FOUND' | 'DOMAIN_AUTH_REQUIRED',
  headers?: Record<string, string>,
): NextResponse {
  if (reason === 'DOMAIN_NOT_FOUND') {
    return NextResponse.json(
      { error: 'ドメインが見つかりません', code: 'DOMAIN_NOT_FOUND' },
      { status: 404, headers },
    );
  }

  return NextResponse.json(
    { error: 'このドメインへのアクセスには認証が必要です', code: 'DOMAIN_AUTH_REQUIRED' },
    { status: 401, headers },
  );
}