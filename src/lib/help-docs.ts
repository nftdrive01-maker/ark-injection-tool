import fs from 'fs';
import path from 'path';

export type HelpDoc = {
  id: string;
  title: string;
  summary: string;
  category: string;
  filePath: string;
  fileName: string;
  relativePath: string;
  headings: Array<{ level: number; title: string; slug: string }>;
  content: string;
};

type HelpDocSource = {
  filePath: string;
  category: string;
  relativePath: string;
};

const systemDocsDir = path.resolve(process.cwd(), '..', 'ark-injection-ai-system', 'docs');
const arkRootDir = path.resolve(process.cwd(), '..', 'ark-injection-ai-system');

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function humanizeFileName(fileName: string): string {
  return fileName.replace(/\.md$/i, '').replace(/_/g, ' ');
}

function extractSummary(content: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/^(#|>|-|\d+\.|```|\|)/.test(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return 'ドキュメント概要は本文を参照してください。';
}

function extractHeadings(content: string): Array<{ level: number; title: string; slug: string }> {
  const lines = content.split(/\r?\n/);
  const slugCounts = new Map<string, number>();

  return lines.flatMap((line) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) {
      return [];
    }

    const level = match[1].length;
    const title = match[2].trim();
    const baseSlug = slugify(title);
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);

    return [{
      level,
      title,
      slug: count === 0 ? baseSlug : `${baseSlug}-${count + 1}`,
    }];
  });
}

function buildSources(): HelpDocSource[] {
  const sources: HelpDocSource[] = [];

  if (fs.existsSync(systemDocsDir)) {
    const systemFiles = fs.readdirSync(systemDocsDir)
      .filter((entry) => entry.toLowerCase().endsWith('.md'))
      .sort((left, right) => left.localeCompare(right, 'ja'));

    for (const fileName of systemFiles) {
      sources.push({
        filePath: path.join(systemDocsDir, fileName),
        category: 'システム docs',
        relativePath: `docs/${fileName}`,
      });
    }
  }

  const extras: Array<{ fileName: string; category: string }> = [
    { fileName: 'EXTERNAL_PUBLISH_MANUAL_JA.md', category: '公開・ネットワーク' },
    { fileName: 'SBV2_CPU_CUDA_SWITCH_MANUAL_JA.md', category: '音声・SBV2' },
    { fileName: 'README.md', category: 'injection-tool' },
    { fileName: 'IMPLEMENTATION_GUIDE.md', category: 'injection-tool' },
    { fileName: 'MCP_SETUP.md', category: 'MCP・連携' },
    { fileName: 'GOOGLE_WORKSPACE_MCP_MANUAL_JA.md', category: 'MCP・連携' },
  ];

  for (const extra of extras) {
    const isArkRootDoc = fs.existsSync(path.join(arkRootDir, extra.fileName));
    const filePath = isArkRootDoc
      ? path.join(arkRootDir, extra.fileName)
      : path.join(process.cwd(), extra.fileName);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    sources.push({
      filePath,
      category: extra.category,
      relativePath: path.relative(arkRootDir, filePath).replace(/\\/g, '/'),
    });
  }

  return sources;
}

export function getHelpDocs(): HelpDoc[] {
  return buildSources().map((source) => {
    const content = fs.readFileSync(source.filePath, 'utf-8');
    const fileName = path.basename(source.filePath);
    const headings = extractHeadings(content);
    const title = headings[0]?.title || humanizeFileName(fileName);

    return {
      id: fileName.replace(/\.md$/i, '').toLowerCase(),
      title,
      summary: extractSummary(content),
      category: source.category,
      filePath: source.filePath,
      fileName,
      relativePath: source.relativePath,
      headings,
      content,
    };
  });
}