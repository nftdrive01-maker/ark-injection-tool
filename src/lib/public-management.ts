import fs from 'fs';
import path from 'path';

export interface PublicManagementSettings {
  maxConcurrentSessions: number;
  chatRequestsPerUserPerMinute: number;
  ttsRequestsPerUserPerMinute: number;
  launcherEnabled: boolean;
}

type PublicManagementSettingsInput = Partial<PublicManagementSettings> & {
  requestsPerUserPerMinute?: number;
};

type LegacyDomainConfig = {
  maxConcurrentSessions?: unknown;
};

const PUBLIC_SETTINGS_PATH =
  process.env.INJECTION_PUBLIC_SETTINGS_CONFIG || './data/public-settings.json';
const DOMAINS_CONFIG_PATH = process.env.INJECTION_DOMAINS_CONFIG || './data/domains.json';

const DEFAULT_SETTINGS: PublicManagementSettings = {
  maxConcurrentSessions: 0,
  chatRequestsPerUserPerMinute: 0,
  ttsRequestsPerUserPerMinute: 0,
  launcherEnabled: true,
};

function normalize(input: PublicManagementSettingsInput | null | undefined): PublicManagementSettings {
  const raw = Number(input?.maxConcurrentSessions ?? DEFAULT_SETTINGS.maxConcurrentSessions);
  const maxConcurrentSessions = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : DEFAULT_SETTINGS.maxConcurrentSessions;
  const legacyRequestsPerUserPerMinute = Number(
    input?.requestsPerUserPerMinute ?? 0
  );
  const normalizedLegacyRequestsPerUserPerMinute = Number.isFinite(legacyRequestsPerUserPerMinute)
    ? Math.max(0, Math.floor(legacyRequestsPerUserPerMinute))
    : 0;
  const rawChatRequestsPerUserPerMinute = Number(
    input?.chatRequestsPerUserPerMinute ?? normalizedLegacyRequestsPerUserPerMinute
  );
  const chatRequestsPerUserPerMinute = Number.isFinite(rawChatRequestsPerUserPerMinute)
    ? Math.max(0, Math.floor(rawChatRequestsPerUserPerMinute))
    : DEFAULT_SETTINGS.chatRequestsPerUserPerMinute;
  const rawTtsRequestsPerUserPerMinute = Number(
    input?.ttsRequestsPerUserPerMinute ?? normalizedLegacyRequestsPerUserPerMinute
  );
  const ttsRequestsPerUserPerMinute = Number.isFinite(rawTtsRequestsPerUserPerMinute)
    ? Math.max(0, Math.floor(rawTtsRequestsPerUserPerMinute))
    : DEFAULT_SETTINGS.ttsRequestsPerUserPerMinute;
  const launcherEnabled =
    typeof input?.launcherEnabled === 'boolean'
      ? input.launcherEnabled
      : typeof input?.launcherEnabled === 'string'
        ? input.launcherEnabled !== 'false'
        : DEFAULT_SETTINGS.launcherEnabled;

  return {
    maxConcurrentSessions,
    chatRequestsPerUserPerMinute,
    ttsRequestsPerUserPerMinute,
    launcherEnabled,
  };
}

function getDerivedGlobalRequestsPerMinute(maxConcurrentSessions: number, requestsPerUserPerMinute: number): number {
  const normalizedMaxConcurrentSessions = Math.max(0, Math.floor(maxConcurrentSessions || 0));
  const normalizedRequestsPerUserPerMinute = Math.max(0, Math.floor(requestsPerUserPerMinute || 0));

  if (normalizedMaxConcurrentSessions <= 0 || normalizedRequestsPerUserPerMinute <= 0) {
    return 0;
  }

  return normalizedMaxConcurrentSessions * normalizedRequestsPerUserPerMinute;
}

export function getDerivedGlobalChatRequestsPerMinute(
  settings: PublicManagementSettings
): number {
  return getDerivedGlobalRequestsPerMinute(
    settings.maxConcurrentSessions,
    settings.chatRequestsPerUserPerMinute,
  );
}

export function getDerivedGlobalTtsRequestsPerMinute(
  settings: PublicManagementSettings
): number {
  return getDerivedGlobalRequestsPerMinute(
    settings.maxConcurrentSessions,
    settings.ttsRequestsPerUserPerMinute,
  );
}

function writeSettingsToFile(settings: PublicManagementSettings): void {
  const filePath = path.resolve(process.cwd(), PUBLIC_SETTINGS_PATH);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}

function readLegacyMaxConcurrentFromDomains(): number | null {
  try {
    const domainsPath = path.resolve(process.cwd(), DOMAINS_CONFIG_PATH);
    if (!fs.existsSync(domainsPath)) {
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(domainsPath, 'utf-8'));
    const domains = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.domains)
        ? parsed.domains
        : [];

    let migratedMax = 0;
    let foundLegacy = false;
    for (const domain of domains) {
      const raw = Number((domain as LegacyDomainConfig)?.maxConcurrentSessions);
      if (!Number.isFinite(raw)) {
        continue;
      }
      foundLegacy = true;
      migratedMax = Math.max(migratedMax, Math.max(0, Math.floor(raw)));
    }

    return foundLegacy ? migratedMax : null;
  } catch {
    return null;
  }
}

export function getPublicManagementSettings(): PublicManagementSettings {
  try {
    const filePath = path.resolve(process.cwd(), PUBLIC_SETTINGS_PATH);
    if (!fs.existsSync(filePath)) {
      // 初回のみ: 旧ドメイン単位設定(maxConcurrentSessions)から公開管理へ自動移行
      const legacyMax = readLegacyMaxConcurrentFromDomains();
      const migrated = normalize(
        legacyMax === null ? DEFAULT_SETTINGS : { maxConcurrentSessions: legacyMax }
      );
      writeSettingsToFile(migrated);
      return migrated;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return normalize(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function updatePublicManagementSettings(
  updates: PublicManagementSettingsInput,
): PublicManagementSettings {
  const current = getPublicManagementSettings();
  const next = normalize({ ...current, ...updates });

  writeSettingsToFile(next);
  return next;
}
