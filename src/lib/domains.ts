/**
 * ナレッジ/ドメイン管理ロジック
 * - Knowledge: 再利用可能な知識部品
 * - Domain: 複数Knowledgeを組み合わせる呼び出し単位
 */

import fs from 'fs';
import path from 'path';
import { type PronunciationRule, getAllPronunciationRules, setAllPronunciationRules } from './pronunciations';

export interface Knowledge {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  context: string;
  enabled: boolean;
  priority: number;
  updatedAt: string;
}

export interface Chronicle {
  id: string;
  name: string;
  description: string;
  host: string;
  apiPort: number;
  tcpPort: number;
  enabled: boolean;
  lastDiscoveredAt?: string;
  lastConnectedAt?: string;
  updatedAt: string;
}

export interface Domain {
  id: string;
  name: string;
  description: string;
  enabled?: boolean;
  baseSystemPrompt: string;
  baseContext: string;
  bgUrl?: string;
  characterName?: string;
  vrmEnabled?: boolean;
  vrmUrl?: string;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  ttsMuted?: boolean;
  imageAvatarIdleUrl?: string;
  imageAvatarTalkUrl?: string;
  imageAvatarTalkIntervalMs?: number;
  knowledgeIds: string[];
  mcpServerIds?: string[];
  chronicleIds?: string[];
  memoryIds?: string[];
  version: string;
  ttl: number;
}

export interface ResolvedDomain extends Domain {
  systemPrompt: string;
  context: string;
}

interface KnowledgeDomainStore {
  knowledges: Knowledge[];
  domains: Domain[];
  chronicles: Chronicle[];
}

export interface FullBackupData {
  exportedAt: string;
  version: string;
  store: {
    knowledges: Knowledge[];
    domains: Domain[];
    chronicles: Chronicle[];
  };
  pronunciations?: PronunciationRule[];
}

const DOMAINS_CONFIG_PATH = process.env.INJECTION_DOMAINS_CONFIG || './data/domains.json';
const DEFAULT_TTL = parseInt(process.env.INJECTION_DEFAULT_TTL || '3600', 10);
const DEFAULT_DOMAIN_ID = process.env.INJECTION_DEFAULT_DOMAIN_ID || 'default';
const DEFAULT_DOMAIN_NAME = process.env.INJECTION_DEFAULT_DOMAIN_NAME || 'デフォルト';
const DEFAULT_DOMAIN_DESCRIPTION =
  process.env.INJECTION_DEFAULT_DOMAIN_DESCRIPTION ||
  '初期ドメイン（環境変数から生成）';
const DEFAULT_DOMAIN_BASE_SYSTEM_PROMPT =
  process.env.INJECTION_DEFAULT_DOMAIN_BASE_SYSTEM_PROMPT ||
  'あなたは丁寧で信頼できる案内役です。';
const DEFAULT_DOMAIN_BASE_CONTEXT =
  process.env.INJECTION_DEFAULT_DOMAIN_BASE_CONTEXT ||
  '共通ナレッジを活用し、簡潔かつ正確に回答してください。';

const DEFAULT_KNOWLEDGE_ID = process.env.INJECTION_DEFAULT_KNOWLEDGE_ID || 'default_knowledge';
const DEFAULT_KNOWLEDGE_NAME = process.env.INJECTION_DEFAULT_KNOWLEDGE_NAME || 'デフォルトナレッジ';
const DEFAULT_KNOWLEDGE_DESCRIPTION =
  process.env.INJECTION_DEFAULT_KNOWLEDGE_DESCRIPTION ||
  '初期ナレッジ（環境変数から生成）';
const DEFAULT_KNOWLEDGE_SYSTEM_PROMPT =
  process.env.INJECTION_DEFAULT_KNOWLEDGE_SYSTEM_PROMPT ||
  'ユーザーの意図を汲み取り、必要十分な情報のみを返答してください。';
const DEFAULT_KNOWLEDGE_CONTEXT =
  process.env.INJECTION_DEFAULT_KNOWLEDGE_CONTEXT ||
  '初期コンテキスト: この内容は環境変数で上書きできます。';
const DEFAULT_KNOWLEDGE_PRIORITY = parseInt(
  process.env.INJECTION_DEFAULT_KNOWLEDGE_PRIORITY || '100',
  10
);

function sanitizeId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

/**
 * 保存形式が旧Domain配列でも新Store形式でも読み込めるようにする
 */
function loadStoreFromFile(): KnowledgeDomainStore {
  try {
    const filePath = path.resolve(process.cwd(), DOMAINS_CONFIG_PATH);
    if (!fs.existsSync(filePath)) {
      return getDefaultStore();
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    // 新形式
    if (parsed?.knowledges && parsed?.domains) {
      return {
        knowledges: parsed.knowledges as Knowledge[],
        domains: (parsed.domains as Domain[]).map((domain) => ({
          ...domain,
          chronicleIds: Array.isArray(domain.chronicleIds) ? domain.chronicleIds : [],
        })),
        chronicles: Array.isArray(parsed.chronicles) ? parsed.chronicles as Chronicle[] : [],
      };
    }

    // 旧形式（Domain配列）から移行
    if (Array.isArray(parsed)) {
      return migrateLegacyDomains(parsed as Array<{
        id: string;
        name: string;
        description: string;
        systemPrompt: string;
        context: string;
        version: string;
        ttl: number;
      }>);
    }

    return getDefaultStore();
  } catch (err) {
    console.error('Error loading store:', err);
    return getDefaultStore();
  }
}

/**
 * 旧形式から新形式へ移行
 */
function migrateLegacyDomains(legacyDomains: Array<{
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  context: string;
  version: string;
  ttl: number;
}>): KnowledgeDomainStore {
  const knowledges: Knowledge[] = legacyDomains.map((domain) => ({
    id: `${domain.id}_knowledge`,
    name: `${domain.name}ナレッジ`,
    description: `${domain.name}向けの旧データ移行ナレッジ`,
    systemPrompt: domain.systemPrompt || '',
    context: domain.context || '',
    enabled: true,
    priority: 100,
    updatedAt: new Date().toISOString(),
  }));

  const domains: Domain[] = legacyDomains.map((domain) => ({
    id: domain.id,
    name: domain.name,
    description: domain.description,
    enabled: true,
    baseSystemPrompt: '',
    baseContext: '',
    knowledgeIds: [`${domain.id}_knowledge`],
    mcpServerIds: [],
    chronicleIds: [],
    memoryIds: [],
    ttsMuted: undefined,
    version: domain.version || '1.0.0',
    ttl: domain.ttl || DEFAULT_TTL,
  }));

  return { knowledges, domains, chronicles: [] };
}

/**
 * デフォルトのKnowledge/Domain構成
 */
function getDefaultStore(): KnowledgeDomainStore {
  const knowledges: Knowledge[] = [
    {
      id: sanitizeId(DEFAULT_KNOWLEDGE_ID, 'default_knowledge'),
      name: DEFAULT_KNOWLEDGE_NAME,
      description: DEFAULT_KNOWLEDGE_DESCRIPTION,
      systemPrompt: DEFAULT_KNOWLEDGE_SYSTEM_PROMPT,
      context: DEFAULT_KNOWLEDGE_CONTEXT,
      enabled: true,
      priority: Number.isNaN(DEFAULT_KNOWLEDGE_PRIORITY) ? 100 : DEFAULT_KNOWLEDGE_PRIORITY,
      updatedAt: new Date().toISOString(),
    },
  ];

  const domains: Domain[] = [
    {
      id: sanitizeId(DEFAULT_DOMAIN_ID, 'default'),
      name: DEFAULT_DOMAIN_NAME,
      description: DEFAULT_DOMAIN_DESCRIPTION,
      enabled: true,
      baseSystemPrompt: DEFAULT_DOMAIN_BASE_SYSTEM_PROMPT,
      baseContext: DEFAULT_DOMAIN_BASE_CONTEXT,
      bgUrl: '',
      characterName: '',
      vrmEnabled: true,
      vrmUrl: '',
      stylebertvits2ModelId: '',
      stylebertvits2Style: '',
      ttsMuted: undefined,
      knowledgeIds: [sanitizeId(DEFAULT_KNOWLEDGE_ID, 'default_knowledge')],
      mcpServerIds: [],
      chronicleIds: [],
      memoryIds: [],
      version: '1.0.0',
      ttl: DEFAULT_TTL,
    },
  ];

  return { knowledges, domains, chronicles: [] };
}

function writeStoreToFile(store: KnowledgeDomainStore): void {
  const filePath = path.resolve(process.cwd(), DOMAINS_CONFIG_PATH);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

function resolveDomain(domain: Domain, knowledges: Knowledge[]): ResolvedDomain {
  const lookup = new Map(knowledges.map((knowledge) => [knowledge.id, knowledge]));
  const selectedKnowledges = domain.knowledgeIds
    .map((knowledgeId) => lookup.get(knowledgeId))
    .filter((knowledge): knowledge is Knowledge => Boolean(knowledge) && Boolean(knowledge?.enabled));

  const injectedSystemParts = selectedKnowledges
    .sort((a, b) => a.priority - b.priority)
    .map((knowledge) => knowledge.systemPrompt)
    .filter((part) => part.trim() !== '');

  const injectedContextParts = selectedKnowledges
    .sort((a, b) => a.priority - b.priority)
    .map((knowledge) => knowledge.context)
    .filter((part) => part.trim() !== '');

  const systemPrompt = [domain.baseSystemPrompt, ...injectedSystemParts]
    .filter((part) => part.trim() !== '')
    .join('\n\n');

  const context = [domain.baseContext, ...injectedContextParts]
    .filter((part) => part.trim() !== '')
    .join('\n\n');

  return {
    ...domain,
    systemPrompt,
    context,
  };
}

/**
 * 全ドメインを取得
 */
export function getAllDomains(): ResolvedDomain[] {
  const store = loadStoreFromFile();
  return store.domains.map((domain) => resolveDomain(domain, store.knowledges));
}

/**
 * 全ナレッジを取得
 */
export function getAllKnowledges(): Knowledge[] {
  const store = loadStoreFromFile();
  return store.knowledges.sort((a, b) => a.priority - b.priority);
}

/**
 * 指定IDのドメインを取得
 */
export function getDomainById(id: string): ResolvedDomain | undefined {
  const store = loadStoreFromFile();
  const domain = store.domains.find((item) => item.id === id);
  if (!domain) {
    return undefined;
  }
  return resolveDomain(domain, store.knowledges);
}

/**
 * 指定IDのナレッジを取得
 */
export function getKnowledgeById(id: string): Knowledge | undefined {
  const store = loadStoreFromFile();
  return store.knowledges.find((item) => item.id === id);
}

/**
 * ドメインを更新
 */
export function updateDomain(id: string, updates: Partial<Domain>): ResolvedDomain | null {
  const store = loadStoreFromFile();
  const index = store.domains.findIndex((domain) => domain.id === id);

  if (index === -1) {
    return null;
  }

  const updated: Domain = {
    ...store.domains[index],
    ...updates,
    id: store.domains[index].id,
    knowledgeIds: Array.isArray(updates.knowledgeIds)
      ? updates.knowledgeIds
      : store.domains[index].knowledgeIds,
    chronicleIds: Array.isArray(updates.chronicleIds)
      ? updates.chronicleIds
      : (store.domains[index].chronicleIds || []),
    memoryIds: Array.isArray(updates.memoryIds)
      ? updates.memoryIds
      : (store.domains[index].memoryIds || []),
  };

  store.domains[index] = updated;

  try {
    writeStoreToFile(store);
    return resolveDomain(updated, store.knowledges);
  } catch (err) {
    console.error('Error updating domain:', err);
    return null;
  }
}

/**
 * ナレッジを更新
 */
export function updateKnowledge(id: string, updates: Partial<Knowledge>): Knowledge | null {
  const store = loadStoreFromFile();
  const index = store.knowledges.findIndex((knowledge) => knowledge.id === id);

  if (index === -1) {
    return null;
  }

  const updated: Knowledge = {
    ...store.knowledges[index],
    ...updates,
    id: store.knowledges[index].id,
    updatedAt: new Date().toISOString(),
  };

  store.knowledges[index] = updated;

  try {
    writeStoreToFile(store);
    return updated;
  } catch (err) {
    console.error('Error updating knowledge:', err);
    return null;
  }
}

/**
 * ナレッジを追加
 */
export function createKnowledge(input: {
  name: string;
  description?: string;
  systemPrompt?: string;
  context?: string;
  enabled?: boolean;
  priority?: number;
}): Knowledge {
  const store = loadStoreFromFile();
  const baseId = sanitizeId(input.name, 'knowledge');

  let id = baseId;
  let suffix = 1;
  while (store.knowledges.some((knowledge) => knowledge.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const created: Knowledge = {
    id,
    name: input.name,
    description: input.description || '',
    systemPrompt: input.systemPrompt || '',
    context: input.context || '',
    enabled: input.enabled ?? true,
    priority: typeof input.priority === 'number' ? input.priority : 100,
    updatedAt: new Date().toISOString(),
  };

  store.knowledges.push(created);
  writeStoreToFile(store);
  return created;
}

/**
 * ナレッジを削除
 * - 最低1件は残す
 * - ドメインで参照中のナレッジは削除不可
 */
export function deleteKnowledge(id: string): boolean {
  const store = loadStoreFromFile();
  if (store.knowledges.length <= 1) {
    return false;
  }

  const isReferenced = store.domains.some((domain) => domain.knowledgeIds.includes(id));
  if (isReferenced) {
    return false;
  }

  const before = store.knowledges.length;
  store.knowledges = store.knowledges.filter((knowledge) => knowledge.id !== id);

  if (store.knowledges.length === before) {
    return false;
  }

  writeStoreToFile(store);
  return true;
}

/**
 * ドメインを追加
 */
export function createDomain(input: {
  name: string;
  description?: string;
  enabled?: boolean;
  baseSystemPrompt?: string;
  baseContext?: string;
  bgUrl?: string;
  characterName?: string;
  vrmEnabled?: boolean;
  vrmUrl?: string;
  imageAvatarIdleUrl?: string;
  imageAvatarTalkUrl?: string;
  imageAvatarTalkIntervalMs?: number;
  ttsMuted?: boolean;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  knowledgeIds?: string[];
  mcpServerIds?: string[];
  chronicleIds?: string[];
  memoryIds?: string[];
  ttl?: number;
}): ResolvedDomain {
  const store = loadStoreFromFile();
  const baseId = sanitizeId(input.name, 'domain');

  let id = baseId;
  let suffix = 1;
  while (store.domains.some((domain) => domain.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const knowledgeIds =
    Array.isArray(input.knowledgeIds) && input.knowledgeIds.length > 0
      ? input.knowledgeIds
      : store.knowledges.slice(0, 1).map((knowledge) => knowledge.id);

  const created: Domain = {
    id,
    name: input.name,
    description: input.description || '',
    enabled: input.enabled ?? true,
    baseSystemPrompt: input.baseSystemPrompt || '',
    baseContext: input.baseContext || '',
    bgUrl: input.bgUrl || '',
    characterName: input.characterName || '',
    vrmEnabled: input.vrmEnabled ?? true,
    vrmUrl: input.vrmUrl || '',
    imageAvatarIdleUrl: input.imageAvatarIdleUrl || '',
    imageAvatarTalkUrl: input.imageAvatarTalkUrl || '',
    imageAvatarTalkIntervalMs:
      typeof input.imageAvatarTalkIntervalMs === 'number' ? input.imageAvatarTalkIntervalMs : 180,
    ttsMuted: typeof input.ttsMuted === 'boolean' ? input.ttsMuted : undefined,
    stylebertvits2ModelId: input.stylebertvits2ModelId || '',
    stylebertvits2Style: input.stylebertvits2Style || '',
    knowledgeIds,
    mcpServerIds: Array.isArray(input.mcpServerIds) ? input.mcpServerIds : [],
    chronicleIds: Array.isArray(input.chronicleIds) ? input.chronicleIds : [],
    memoryIds: Array.isArray(input.memoryIds) ? input.memoryIds : [],
    version: '1.0.0',
    ttl: typeof input.ttl === 'number' && input.ttl > 0 ? input.ttl : DEFAULT_TTL,
  };

  store.domains.push(created);
  writeStoreToFile(store);
  return resolveDomain(created, store.knowledges);
}

/**
 * ドメインを削除（最低1件は残す）
 */
export function deleteDomain(id: string): boolean {
  const store = loadStoreFromFile();
  if (store.domains.length <= 1) {
    return false;
  }

  const before = store.domains.length;
  store.domains = store.domains.filter((domain) => domain.id !== id);

  if (store.domains.length === before) {
    return false;
  }

  writeStoreToFile(store);
  return true;
}

export function getDomainOptions(): Array<{
  id: string;
  name: string;
  enabled?: boolean;
  bgUrl?: string;
  characterName?: string;
  vrmEnabled?: boolean;
  vrmUrl?: string;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  ttsMuted?: boolean;
  imageAvatarIdleUrl?: string;
  imageAvatarTalkUrl?: string;
  imageAvatarTalkIntervalMs?: number;
  chronicleIds?: string[];
}> {
  const store = loadStoreFromFile();
  return store.domains.map((domain) => ({
    id: domain.id,
    name: domain.name,
    enabled: domain.enabled ?? true,
    bgUrl: domain.bgUrl || '',
    characterName: domain.characterName || '',
    vrmEnabled: domain.vrmEnabled ?? true,
    vrmUrl: domain.vrmUrl || '',
    stylebertvits2ModelId: domain.stylebertvits2ModelId || '',
    stylebertvits2Style: domain.stylebertvits2Style || '',
    ttsMuted: domain.ttsMuted,
    imageAvatarIdleUrl: domain.imageAvatarIdleUrl || '',
    imageAvatarTalkUrl: domain.imageAvatarTalkUrl || '',
    imageAvatarTalkIntervalMs: domain.imageAvatarTalkIntervalMs || 180,
    chronicleIds: Array.isArray(domain.chronicleIds) ? domain.chronicleIds : [],
  }));
}

export function getAllChronicles(): Chronicle[] {
  const store = loadStoreFromFile();
  return [...store.chronicles].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function getChronicleById(id: string): Chronicle | undefined {
  const store = loadStoreFromFile();
  return store.chronicles.find((item) => item.id === id);
}

export function createChronicle(input: {
  name: string;
  description?: string;
  host: string;
  apiPort: number;
  tcpPort: number;
  enabled?: boolean;
  lastDiscoveredAt?: string;
  lastConnectedAt?: string;
}): Chronicle {
  const store = loadStoreFromFile();
  const baseId = sanitizeId(input.name, 'chronicle');

  let id = baseId;
  let suffix = 1;
  while (store.chronicles.some((chronicle) => chronicle.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const created: Chronicle = {
    id,
    name: input.name,
    description: input.description || '',
    host: input.host,
    apiPort: input.apiPort,
    tcpPort: input.tcpPort,
    enabled: input.enabled ?? true,
    lastDiscoveredAt: input.lastDiscoveredAt,
    lastConnectedAt: input.lastConnectedAt,
    updatedAt: new Date().toISOString(),
  };

  store.chronicles.push(created);
  writeStoreToFile(store);
  return created;
}

export function updateChronicle(id: string, updates: Partial<Chronicle>): Chronicle | null {
  const store = loadStoreFromFile();
  const index = store.chronicles.findIndex((chronicle) => chronicle.id === id);

  if (index === -1) {
    return null;
  }

  const updated: Chronicle = {
    ...store.chronicles[index],
    ...updates,
    id: store.chronicles[index].id,
    updatedAt: new Date().toISOString(),
  };

  store.chronicles[index] = updated;

  try {
    writeStoreToFile(store);
    return updated;
  } catch (err) {
    console.error('Error updating chronicle:', err);
    return null;
  }
}

export function deleteChronicle(id: string): boolean {
  const store = loadStoreFromFile();
  const isReferenced = store.domains.some((domain) => (domain.chronicleIds || []).includes(id));
  if (isReferenced) {
    return false;
  }

  const before = store.chronicles.length;
  store.chronicles = store.chronicles.filter((chronicle) => chronicle.id !== id);

  if (store.chronicles.length === before) {
    return false;
  }

  writeStoreToFile(store);
  return true;
}

/**
 * デフォルトデータを初期化（管理用）
 */
export function initializeDefaultDomains(): void {
  try {
    const defaults = getDefaultStore();
    writeStoreToFile(defaults);
    console.log(`Initialized store at ${path.resolve(process.cwd(), DOMAINS_CONFIG_PATH)}`);
  } catch (err) {
    console.error('Error initializing store:', err);
  }
}

export function exportFullBackup(): FullBackupData {
  const store = loadStoreFromFile();
  const pronunciations = getAllPronunciationRules();
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    store: {
      knowledges: store.knowledges,
      domains: store.domains,
      chronicles: store.chronicles,
    },
    pronunciations,
  };
}

export function importFullBackup(input: unknown): { ok: boolean; error?: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'バックアップ形式が不正です' };
  }

  const candidate = input as {
    store?: {
      knowledges?: Array<Partial<Knowledge>>;
      domains?: Array<Partial<Domain>>;
      chronicles?: Array<Partial<Chronicle>>;
    };
    pronunciations?: Array<Partial<PronunciationRule>>;
  };

  const knowledgesRaw = candidate.store?.knowledges;
  const domainsRaw = candidate.store?.domains;
  const chroniclesRaw = candidate.store?.chronicles;
  const pronunciationsRaw = candidate.pronunciations;

  if (!Array.isArray(knowledgesRaw) || !Array.isArray(domainsRaw)) {
    return { ok: false, error: 'バックアップに store.knowledges / store.domains が必要です' };
  }

  if (knowledgesRaw.length === 0 || domainsRaw.length === 0) {
    return { ok: false, error: 'ナレッジとドメインは最低1件必要です' };
  }

  const knowledges: Knowledge[] = knowledgesRaw.map((item, index) => ({
    id: sanitizeId(typeof item.id === 'string' ? item.id : `knowledge_${index + 1}`, `knowledge_${index + 1}`),
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Knowledge ${index + 1}`,
    description: typeof item.description === 'string' ? item.description : '',
    systemPrompt: typeof item.systemPrompt === 'string' ? item.systemPrompt : '',
    context: typeof item.context === 'string' ? item.context : '',
    enabled: item.enabled !== false,
    priority: typeof item.priority === 'number' ? item.priority : 100,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
  }));

  const uniqueKnowledgeIds = new Set<string>();
  for (const knowledge of knowledges) {
    if (uniqueKnowledgeIds.has(knowledge.id)) {
      return { ok: false, error: `ナレッジIDが重複しています: ${knowledge.id}` };
    }
    uniqueKnowledgeIds.add(knowledge.id);
  }

  const domains: Domain[] = domainsRaw.map((item, index) => ({
    id: sanitizeId(typeof item.id === 'string' ? item.id : `domain_${index + 1}`, `domain_${index + 1}`),
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Domain ${index + 1}`,
    description: typeof item.description === 'string' ? item.description : '',
    enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    baseSystemPrompt: typeof item.baseSystemPrompt === 'string' ? item.baseSystemPrompt : '',
    baseContext: typeof item.baseContext === 'string' ? item.baseContext : '',
    bgUrl: typeof item.bgUrl === 'string' ? item.bgUrl : undefined,
    characterName: typeof item.characterName === 'string' ? item.characterName : undefined,
    vrmEnabled: typeof item.vrmEnabled === 'boolean' ? item.vrmEnabled : undefined,
    vrmUrl: typeof item.vrmUrl === 'string' ? item.vrmUrl : undefined,
    stylebertvits2ModelId: typeof item.stylebertvits2ModelId === 'string' ? item.stylebertvits2ModelId : undefined,
    stylebertvits2Style: typeof item.stylebertvits2Style === 'string' ? item.stylebertvits2Style : undefined,
    imageAvatarIdleUrl: typeof item.imageAvatarIdleUrl === 'string' ? item.imageAvatarIdleUrl : undefined,
    imageAvatarTalkUrl: typeof item.imageAvatarTalkUrl === 'string' ? item.imageAvatarTalkUrl : undefined,
    imageAvatarTalkIntervalMs: typeof item.imageAvatarTalkIntervalMs === 'number' ? item.imageAvatarTalkIntervalMs : undefined,
    knowledgeIds: Array.isArray(item.knowledgeIds)
      ? item.knowledgeIds.filter((id): id is string => typeof id === 'string')
      : [],
    chronicleIds: Array.isArray(item.chronicleIds)
      ? item.chronicleIds.filter((id): id is string => typeof id === 'string')
      : [],
    memoryIds: Array.isArray(item.memoryIds)
      ? item.memoryIds.filter((id): id is string => typeof id === 'string')
      : [],
    mcpServerIds: Array.isArray(item.mcpServerIds)
      ? item.mcpServerIds.filter((id): id is string => typeof id === 'string')
      : undefined,
    version: typeof item.version === 'string' && item.version.trim() ? item.version : '1.0.0',
    ttl: typeof item.ttl === 'number' && item.ttl > 0 ? item.ttl : DEFAULT_TTL,
  }));

  const chronicles: Chronicle[] = Array.isArray(chroniclesRaw)
    ? chroniclesRaw.map((item, index) => ({
        id: sanitizeId(typeof item.id === 'string' ? item.id : `chronicle_${index + 1}`, `chronicle_${index + 1}`),
        name:
          typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : `Chronicle ${index + 1}`,
        description: typeof item.description === 'string' ? item.description : '',
        host: typeof item.host === 'string' && item.host.trim() ? item.host.trim() : '127.0.0.1',
        apiPort:
          typeof item.apiPort === 'number' && Number.isFinite(item.apiPort)
            ? Math.floor(item.apiPort)
            : 8000,
        tcpPort:
          typeof item.tcpPort === 'number' && Number.isFinite(item.tcpPort)
            ? Math.floor(item.tcpPort)
            : 8001,
        enabled: item.enabled !== false,
        lastDiscoveredAt:
          typeof item.lastDiscoveredAt === 'string' && item.lastDiscoveredAt.trim()
            ? item.lastDiscoveredAt
            : undefined,
        lastConnectedAt:
          typeof item.lastConnectedAt === 'string' && item.lastConnectedAt.trim()
            ? item.lastConnectedAt
            : undefined,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      }))
    : [];

  const uniqueChronicleIds = new Set<string>();
  for (const chronicle of chronicles) {
    if (uniqueChronicleIds.has(chronicle.id)) {
      return { ok: false, error: `CHRONICLE IDが重複しています: ${chronicle.id}` };
    }
    uniqueChronicleIds.add(chronicle.id);
  }

  const uniqueDomainIds = new Set<string>();
  for (const domain of domains) {
    if (uniqueDomainIds.has(domain.id)) {
      return { ok: false, error: `ドメインIDが重複しています: ${domain.id}` };
    }
    uniqueDomainIds.add(domain.id);

    for (const knowledgeId of domain.knowledgeIds) {
      if (!uniqueKnowledgeIds.has(knowledgeId)) {
        return {
          ok: false,
          error: `ドメイン「${domain.name}」が存在しないナレッジIDを参照しています: ${knowledgeId}`,
        };
      }
    }

    for (const chronicleId of domain.chronicleIds || []) {
      if (!uniqueChronicleIds.has(chronicleId)) {
        return {
          ok: false,
          error: `ドメイン「${domain.name}」が存在しないCHRONICLE IDを参照しています: ${chronicleId}`,
        };
      }
    }
  }

  try {
    writeStoreToFile({ knowledges, domains, chronicles });

    // 発音辞書が含まれていれば復元
    if (Array.isArray(pronunciationsRaw) && pronunciationsRaw.length > 0) {
      const restoredRules: PronunciationRule[] = pronunciationsRaw
        .filter((item) => item && typeof item.from === 'string' && typeof item.to === 'string')
        .map((item, index) => ({
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `rule_${index + 1}`,
          from: item.from as string,
          to: item.to as string,
          enabled: item.enabled !== false,
          priority: typeof item.priority === 'number' ? item.priority : 100,
          domainId: typeof item.domainId === 'string' && item.domainId.trim() ? item.domainId.trim() : undefined,
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
        }));
      setAllPronunciationRules(restoredRules);
    }

    return { ok: true };
  } catch (err) {
    console.error('Error importing full backup:', err);
    return { ok: false, error: 'バックアップの読み込みに失敗しました' };
  }
}
