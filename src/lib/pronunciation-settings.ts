import fs from 'fs';
import path from 'path';

export interface PronunciationSettings {
  wanaKanaEnabled: boolean;
  updatedAt: string;
}

const PRONUNCIATION_SETTINGS_PATH =
  process.env.INJECTION_PRONUNCIATION_SETTINGS_CONFIG || './data/pronunciation-settings.json';

function getDefaultSettings(): PronunciationSettings {
  return {
    wanaKanaEnabled: false,
    updatedAt: new Date().toISOString(),
  };
}

function getSettingsFilePath(): string {
  return path.resolve(process.cwd(), PRONUNCIATION_SETTINGS_PATH);
}

export function getPronunciationSettings(): PronunciationSettings {
  try {
    const filePath = getSettingsFilePath();
    if (!fs.existsSync(filePath)) {
      return getDefaultSettings();
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    return {
      wanaKanaEnabled: parsed?.wanaKanaEnabled === true,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error loading pronunciation settings:', err);
    return getDefaultSettings();
  }
}

function writePronunciationSettings(settings: PronunciationSettings): void {
  const filePath = getSettingsFilePath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}

export function updatePronunciationSettings(
  updates: Partial<Pick<PronunciationSettings, 'wanaKanaEnabled'>>,
): PronunciationSettings {
  const current = getPronunciationSettings();
  const next: PronunciationSettings = {
    ...current,
    ...(typeof updates.wanaKanaEnabled === 'boolean'
      ? { wanaKanaEnabled: updates.wanaKanaEnabled }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  writePronunciationSettings(next);
  return next;
}