import {
  AUTH_HEADER_PLACEHOLDER,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  getConfiguredUsername,
  isAdminCredentialConfigurationSafe,
  type SessionPayload,
} from '@/lib/auth-shared';

function base64UrlToBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  if (remainder === 0) {
    return normalized;
  }
  return normalized + '='.repeat(4 - remainder);
}

function decodeBase64Url(input: string): string {
  return atob(base64UrlToBase64(input));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signValueEdge(value: string): Promise<string> {
  const secretBytes = new TextEncoder().encode(SESSION_SECRET);
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyTokenEdge(token: string): Promise<boolean> {
  if (!isAdminCredentialConfigurationSafe()) {
    return false;
  }

  const parts = String(token || '').trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = await signValueEdge(encodedPayload);
  if (!constantTimeEquals(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    if (payload.type !== 'admin-session' || typeof payload.username !== 'string') {
      return false;
    }
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) {
      return false;
    }
    if (payload.username !== getConfiguredUsername()) {
      return false;
    }
    return payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export { AUTH_HEADER_PLACEHOLDER, SESSION_COOKIE_NAME };