import type { NextRequest } from 'next/server';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const ADMIN_USERNAME = (process.env.INJECTION_ADMIN_USERNAME || '').trim();
export const ADMIN_PASSWORD = (process.env.INJECTION_ADMIN_PASSWORD || '').trim();
export const INSECURE_DEFAULTS_ALLOWED = process.env.INJECTION_ALLOW_INSECURE_DEFAULT_ADMIN === 'true';
export const SESSION_SECRET = process.env.INJECTION_SESSION_SECRET?.trim() || '';
export const SESSION_COOKIE_NAME = 'injection_session';
export const AUTH_HEADER_PLACEHOLDER = 'cookie-session';

export type SessionPayload = {
  type: 'admin-session';
  username: string;
  issuedAt: number;
  expiresAt: number;
};

export function getConfiguredUsername(): string {
  return ADMIN_USERNAME;
}

export function getConfiguredPassword(): string {
  return ADMIN_PASSWORD;
}

export function isSessionSecretConfigured(): boolean {
  return SESSION_SECRET.length >= 32;
}

export function getSessionTtlMs(): number {
  return SESSION_TTL_MS;
}

export function isAdminCredentialConfigurationSafe(): boolean {
  const configuredUsername = getConfiguredUsername();
  const configuredPassword = getConfiguredPassword();

  if (!configuredUsername || !configuredPassword || !isSessionSecretConfigured()) {
    return false;
  }

  if (INSECURE_DEFAULTS_ALLOWED) {
    return true;
  }

  return !(
    configuredUsername === DEFAULT_ADMIN_USERNAME &&
    configuredPassword === DEFAULT_ADMIN_PASSWORD
  );
}

export function getSessionTokenFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  const raw = String(cookieHeader || '').trim();
  if (!raw) {
    return null;
  }

  const cookies = raw.split(';');
  for (const part of cookies) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }
    const value = rest.join('=').trim();
    return value || null;
  }

  return null;
}

export function extractToken(authHeader: string): string | null {
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return null;
}

export function getSessionTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  const headerToken = authHeader ? extractToken(authHeader) : null;
  if (headerToken && headerToken !== AUTH_HEADER_PLACEHOLDER) {
    return headerToken;
  }

  return getSessionTokenFromCookieHeader(req.headers.get('cookie'));
}

export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    return true;
  }

  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const requestUrl = new URL(req.url);
  const requestOrigin = `${forwardedProto || requestUrl.protocol.replace(':', '')}://${forwardedHost || requestUrl.host}`;

  return origin === requestOrigin;
}

export function isSecureRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (typeof forwardedProto === 'string' && forwardedProto.toLowerCase().includes('https')) {
    return true;
  }

  return req.nextUrl.protocol === 'https:';
}