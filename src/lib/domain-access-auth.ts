import crypto from 'crypto';

export type DomainAccessUser = {
  id: string;
  username: string;
  passwordHash: string;
  updatedAt: string;
};

type StoredDomainAccessUser = Partial<DomainAccessUser> & {
  password?: string;
};

const DOMAIN_ACCESS_TOKEN_SECRET = process.env.INJECTION_DOMAIN_ACCESS_TOKEN_SECRET || 'change-me-domain-access-secret';
const DOMAIN_ACCESS_TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildPasswordHash(password: string): string {
  return `sha256:${digest(password)}`;
}

export function hashDomainAccessPassword(password: string): string {
  return buildPasswordHash(password || '');
}

export function verifyDomainAccessPassword(password: string, passwordHash: string): boolean {
  if (!passwordHash) {
    return false;
  }

  if (passwordHash.startsWith('sha256:')) {
    return buildPasswordHash(password || '') === passwordHash;
  }

  return passwordHash === password;
}

export function sanitizeDomainAccessUsername(username: string): string {
  return String(username || '').trim();
}

export function normalizeStoredAccessUsers(users: unknown): DomainAccessUser[] {
  if (!Array.isArray(users)) {
    return [];
  }

  return users
    .map((user, index) => {
      if (!user || typeof user !== 'object') {
        return null;
      }

      const value = user as StoredDomainAccessUser;
      const username = sanitizeDomainAccessUsername(value.username || '');
      const passwordHash = typeof value.passwordHash === 'string' && value.passwordHash.trim().length > 0
        ? value.passwordHash.trim()
        : typeof value.password === 'string' && value.password.length > 0
          ? hashDomainAccessPassword(value.password)
          : '';

      if (!username || !passwordHash) {
        return null;
      }

      return {
        id: typeof value.id === 'string' && value.id.trim().length > 0
          ? value.id.trim()
          : `access_user_${index + 1}`,
        username,
        passwordHash,
        updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.trim().length > 0
          ? value.updatedAt
          : new Date().toISOString(),
      } satisfies DomainAccessUser;
    })
    .filter((user): user is DomainAccessUser => Boolean(user));
}

export function prepareDomainAccessUsersForSave(
  nextUsers: unknown,
  existingUsers: unknown,
): DomainAccessUser[] {
  if (!Array.isArray(nextUsers)) {
    return normalizeStoredAccessUsers(existingUsers);
  }

  const existingById = new Map(
    normalizeStoredAccessUsers(existingUsers).map((user) => [user.id, user]),
  );

  return nextUsers
    .map((user, index) => {
      if (!user || typeof user !== 'object') {
        return null;
      }

      const value = user as StoredDomainAccessUser;
      const id = typeof value.id === 'string' && value.id.trim().length > 0
        ? value.id.trim()
        : `access_user_${index + 1}`;
      const username = sanitizeDomainAccessUsername(value.username || '');
      const existing = existingById.get(id);
      const nextPassword = typeof value.password === 'string' ? value.password : '';

      const passwordHash = nextPassword.trim().length > 0
        ? hashDomainAccessPassword(nextPassword)
        : typeof value.passwordHash === 'string' && value.passwordHash.trim().length > 0
          ? value.passwordHash.trim()
          : existing?.passwordHash || '';

      if (!username || !passwordHash) {
        return null;
      }

      return {
        id,
        username,
        passwordHash,
        updatedAt:
          nextPassword.trim().length > 0 || !existing || existing.username !== username
            ? new Date().toISOString()
            : existing.updatedAt,
      } satisfies DomainAccessUser;
    })
    .filter((user): user is DomainAccessUser => Boolean(user));
}

export function issueDomainAccessToken(domainId: string, username: string): string {
  const payload = {
    domainId: String(domainId || '').trim(),
    username: sanitizeDomainAccessUsername(username),
    timestamp: Date.now(),
    signature: digest(`${String(domainId || '').trim()}::${sanitizeDomainAccessUsername(username)}::${DOMAIN_ACCESS_TOKEN_SECRET}`),
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function verifyDomainAccessToken(domainId: string, token: string): { valid: boolean; username?: string } {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded) as {
      domainId?: string;
      username?: string;
      timestamp?: number;
      signature?: string;
    };

    const username = sanitizeDomainAccessUsername(payload.username || '');
    const expectedSignature = digest(`${String(payload.domainId || '').trim()}::${username}::${DOMAIN_ACCESS_TOKEN_SECRET}`);
    const age = Date.now() - Number(payload.timestamp || 0);

    if (
      String(payload.domainId || '').trim() !== String(domainId || '').trim() ||
      !username ||
      payload.signature !== expectedSignature ||
      age >= DOMAIN_ACCESS_TOKEN_MAX_AGE_MS
    ) {
      return { valid: false };
    }

    return { valid: true, username };
  } catch {
    return { valid: false };
  }
}