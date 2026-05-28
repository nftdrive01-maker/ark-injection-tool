import type { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  AUTH_HEADER_PLACEHOLDER,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  extractToken,
  getConfiguredPassword,
  getConfiguredUsername,
  getSessionTokenFromCookieHeader,
  getSessionTtlMs,
  isAdminCredentialConfigurationSafe,
  isSameOriginRequest,
} from '@/lib/auth-shared';

/**
 * 認証ロジック
 * 環境変数から認証情報を読み込み、署名付きセッションを発行・検証する
 */

type SessionPayload = {
  type: 'admin-session';
  username: string;
  issuedAt: number;
  expiresAt: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

function signValue(value: string): string {
  return createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function buildSessionToken(username: string): string {
  const payload: SessionPayload = {
    type: 'admin-session',
    username,
    issuedAt: Date.now(),
    expiresAt: Date.now() + getSessionTtlMs(),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = signValue(encodedPayload);

  const actual = Buffer.from(signature, 'utf-8');
  const expected = Buffer.from(expectedSignature, 'utf-8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (payload.type !== 'admin-session' || typeof payload.username !== 'string') {
      return null;
    }
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * ログイン処理
 * @param username ユーザー名
 * @param password パスワード
 * @returns トークン（成功時）、null（失敗時）
 */
export function authenticate(username: string, password: string): string | null {
  if (!isAdminCredentialConfigurationSafe()) {
    return null;
  }

  const configuredUsername = getConfiguredUsername();
  const configuredPassword = getConfiguredPassword();
  if (username !== configuredUsername || password !== configuredPassword) {
    return null;
  }

  return buildSessionToken(username);
}

/**
 * トークン検証
 * @param token トークン
 * @returns 有効時true、無効時false
 */
export function verifyToken(token: string): boolean {
  if (!isAdminCredentialConfigurationSafe()) {
    return false;
  }

  const payload = parseSessionToken(token);
  if (!payload) {
    return false;
  }

  if (payload.username !== getConfiguredUsername()) {
    return false;
  }

  return payload.expiresAt > Date.now();
}

export function getSessionTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  const headerToken = authHeader ? extractToken(authHeader) : null;
  if (headerToken && headerToken !== AUTH_HEADER_PLACEHOLDER) {
    return headerToken;
  }

  return getSessionTokenFromCookieHeader(req.headers.get('cookie'));
}

export function hasValidSession(req: NextRequest): boolean {
  const token = getSessionTokenFromRequest(req);
  return Boolean(token && verifyToken(token));
}

export { AUTH_HEADER_PLACEHOLDER, SESSION_COOKIE_NAME, extractToken, getSessionTokenFromCookieHeader, isAdminCredentialConfigurationSafe, isSameOriginRequest };
