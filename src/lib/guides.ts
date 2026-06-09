import fs from 'fs';
import path from 'path';

export type GuideSlideType = 'web' | 'image' | 'qa';

export interface GuideSlide {
  slide_no: number;
  type: GuideSlideType;
  title?: string;
  url?: string;
  display_seconds?: number;
  notes: string;
}

export interface GuideDeck {
  deck_id: string;
  version: string;
  title: string;
  description: string;
  tags: string[];
  slides: GuideSlide[];
  qa_context?: {
    enabled: boolean;
    source: string;
  };
  updatedAt: string;
}

interface GuideStore {
  guides: GuideDeck[];
}

const GUIDES_CONFIG_PATH = process.env.INJECTION_GUIDES_CONFIG || './data/guides.json';
const DEFAULT_SLIDE_SECONDS = 10;

const DEFAULT_GUIDE: GuideDeck = {
  deck_id: 'ark_i_web_demo',
  version: '0.1.0',
  title: 'Ark-i Webデモ',
  description: 'Webページを表示しながらArk-iが説明する3ページ構成のデモ',
  tags: ['Ark-i', 'Webデモ', '展示会', '説明会'],
  slides: [
    {
      slide_no: 1,
      type: 'web',
      url: 'https://ark-i.nftdrive.net',
      display_seconds: DEFAULT_SLIDE_SECONDS,
      notes: 'こちらがArk-iのランディングページです。Ark-iは、現場ごとのドメインに応じてAIコンシェルジュを切り替えられる仕組みです。',
    },
    {
      slide_no: 2,
      type: 'image',
      url: 'https://ark-i.nftdrive.net/img/screenshot1.png',
      display_seconds: DEFAULT_SLIDE_SECONDS,
      notes: 'この図はArk-iの基本構成です。Amicaがユーザーインターフェースを担当し、BEYOND-CoreがMCPや外部サービスとの接続を担当します。',
    },
    {
      slide_no: 3,
      type: 'qa',
      title: '質疑応答',
      display_seconds: DEFAULT_SLIDE_SECONDS,
      notes: '以上で説明は終了です。ここからは、Ark-iについてご質問ください。',
    },
  ],
  qa_context: {
    enabled: true,
    source: 'slides_and_notes',
  },
  updatedAt: new Date().toISOString(),
};

function getStorePath(): string {
  return path.resolve(process.cwd(), GUIDES_CONFIG_PATH);
}

function sanitizeId(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value : '';
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSlide(value: unknown, index: number): GuideSlide {
  const item = value && typeof value === 'object' ? value as Partial<GuideSlide> : {};
  const type: GuideSlideType =
    item.type === 'web' || item.type === 'image' || item.type === 'qa' ? item.type : 'qa';
  const rawSeconds = Number(item.display_seconds);
  const displaySeconds = Number.isFinite(rawSeconds) && rawSeconds > 0
    ? Math.floor(rawSeconds)
    : DEFAULT_SLIDE_SECONDS;

  return {
    slide_no: index + 1,
    type,
    title: typeof item.title === 'string' ? item.title.trim() : '',
    url: typeof item.url === 'string' ? item.url.trim() : '',
    display_seconds: displaySeconds,
    notes: typeof item.notes === 'string' ? item.notes : '',
  };
}

function normalizeGuide(value: unknown, index: number): GuideDeck {
  const item = value && typeof value === 'object' ? value as Partial<GuideDeck> : {};
  const fallbackId = `guide_${index + 1}`;
  const slides = Array.isArray(item.slides) && item.slides.length > 0
    ? item.slides.map((slide, slideIndex) => normalizeSlide(slide, slideIndex))
    : [normalizeSlide({ type: 'qa', title: '新規ガイド', notes: '' }, 0)];
  const qaContext = item.qa_context && typeof item.qa_context === 'object'
    ? item.qa_context
    : undefined;

  return {
    deck_id: sanitizeId(item.deck_id, fallbackId),
    version: typeof item.version === 'string' && item.version.trim() ? item.version.trim() : '0.1.0',
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `ガイド ${index + 1}`,
    description: typeof item.description === 'string' ? item.description : '',
    tags: normalizeTags(item.tags),
    slides,
    qa_context: {
      enabled: qaContext?.enabled === true,
      source: typeof qaContext?.source === 'string' && qaContext.source.trim()
        ? qaContext.source.trim()
        : 'slides_and_notes',
    },
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
  };
}

function ensureStore(): GuideStore {
  const storePath = getStorePath();
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    const store = { guides: [DEFAULT_GUIDE] };
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
    return store;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    const rawGuides = Array.isArray(parsed) ? parsed : parsed?.guides;
    const guides = Array.isArray(rawGuides)
      ? rawGuides.map((guide, index) => normalizeGuide(guide, index))
      : [DEFAULT_GUIDE];
    return { guides };
  } catch {
    const store = { guides: [DEFAULT_GUIDE] };
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
    return store;
  }
}

function writeStore(store: GuideStore): void {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

export function getAllGuides(): GuideDeck[] {
  return ensureStore().guides;
}

export function getGuideById(id: string): GuideDeck | null {
  return getAllGuides().find((guide) => guide.deck_id === id) || null;
}

export function createGuide(input: Partial<GuideDeck>): GuideDeck {
  const store = ensureStore();
  const base = normalizeGuide(input, store.guides.length);
  let id = base.deck_id;
  let suffix = 2;
  while (store.guides.some((guide) => guide.deck_id === id)) {
    id = `${base.deck_id}_${suffix}`;
    suffix += 1;
  }

  const created = {
    ...base,
    deck_id: id,
    updatedAt: new Date().toISOString(),
  };
  store.guides.push(created);
  writeStore(store);
  return created;
}

export function updateGuide(id: string, input: Partial<GuideDeck>): GuideDeck | null {
  const store = ensureStore();
  const index = store.guides.findIndex((guide) => guide.deck_id === id);
  if (index < 0) {
    return null;
  }

  const normalized = normalizeGuide({ ...store.guides[index], ...input, deck_id: id }, index);
  const updated = {
    ...normalized,
    deck_id: id,
    updatedAt: new Date().toISOString(),
  };
  store.guides[index] = updated;
  writeStore(store);
  return updated;
}

export function deleteGuide(id: string): boolean {
  const store = ensureStore();
  if (store.guides.length <= 1) {
    return false;
  }

  const next = store.guides.filter((guide) => guide.deck_id !== id);
  if (next.length === store.guides.length) {
    return false;
  }

  writeStore({ guides: next });
  return true;
}
