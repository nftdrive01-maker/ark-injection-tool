import fs from 'fs';
import path from 'path';

export interface PronunciationRule {
  id: string;
  from: string;
  to: string;
  enabled: boolean;
  priority: number;
  domainId?: string;
  updatedAt: string;
}

const PRONUNCIATIONS_CONFIG_PATH = process.env.INJECTION_PRONUNCIATIONS_CONFIG || './data/pronunciations.json';

function sanitizeId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

function getDefaultRules(): PronunciationRule[] {
  return [
    {
      id: 'koumi',
      from: '小海町',
      to: 'コウミまち',
      enabled: true,
      priority: 100,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'minamisaku',
      from: '南佐久郡',
      to: 'みなみさくぐん',
      enabled: true,
      priority: 90,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'yahho',
      from: '八峰の湯',
      to: 'ヤッホーのゆ',
      enabled: true,
      priority: 95,
      updatedAt: new Date().toISOString(),
    },
  ];
}

function loadRulesFromFile(): PronunciationRule[] {
  try {
    const filePath = path.resolve(process.cwd(), PRONUNCIATIONS_CONFIG_PATH);
    if (!fs.existsSync(filePath)) {
      return getDefaultRules();
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return getDefaultRules();
    }

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => ({
        id: sanitizeId(typeof item.id === 'string' ? item.id : `rule_${index + 1}`, `rule_${index + 1}`),
        from: typeof item.from === 'string' ? item.from : '',
        to: typeof item.to === 'string' ? item.to : '',
        enabled: item.enabled !== false,
        priority: typeof item.priority === 'number' ? item.priority : 100,
        domainId: typeof item.domainId === 'string' && item.domainId.trim() ? item.domainId.trim() : undefined,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      }))
      .filter((item) => item.from.trim() && item.to.trim());
  } catch (err) {
    console.error('Error loading pronunciations:', err);
    return getDefaultRules();
  }
}

function writeRulesToFile(rules: PronunciationRule[]): void {
  const filePath = path.resolve(process.cwd(), PRONUNCIATIONS_CONFIG_PATH);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(rules, null, 2), 'utf-8');
}

export function getAllPronunciationRules(): PronunciationRule[] {
  return loadRulesFromFile().sort((a, b) => b.priority - a.priority);
}

export function setAllPronunciationRules(rules: PronunciationRule[]): void {
  writeRulesToFile(rules);
}

export function getPublicPronunciationRules(domainId?: string): PronunciationRule[] {
  return loadRulesFromFile()
    .filter((rule) => rule.enabled)
    .filter((rule) => !domainId || !rule.domainId || rule.domainId === domainId)
    .sort((a, b) => b.priority - a.priority);
}

export function createPronunciationRule(input: {
  from: string;
  to: string;
  enabled?: boolean;
  priority?: number;
  domainId?: string;
}): PronunciationRule {
  const rules = loadRulesFromFile();
  const baseId = sanitizeId(input.from, 'rule');

  let id = baseId;
  let suffix = 1;
  while (rules.some((rule) => rule.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const created: PronunciationRule = {
    id,
    from: input.from,
    to: input.to,
    enabled: input.enabled ?? true,
    priority: typeof input.priority === 'number' ? input.priority : 100,
    domainId: input.domainId,
    updatedAt: new Date().toISOString(),
  };

  rules.push(created);
  writeRulesToFile(rules);
  return created;
}

export function updatePronunciationRule(id: string, updates: Partial<PronunciationRule>): PronunciationRule | null {
  const rules = loadRulesFromFile();
  const index = rules.findIndex((rule) => rule.id === id);
  if (index < 0) {
    return null;
  }

  const updated: PronunciationRule = {
    ...rules[index],
    ...updates,
    id: rules[index].id,
    updatedAt: new Date().toISOString(),
  };

  rules[index] = updated;
  writeRulesToFile(rules);
  return updated;
}

export function deletePronunciationRule(id: string): boolean {
  const rules = loadRulesFromFile();
  const before = rules.length;
  const next = rules.filter((rule) => rule.id !== id);
  if (next.length === before) {
    return false;
  }

  writeRulesToFile(next);
  return true;
}
