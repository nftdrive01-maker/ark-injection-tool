export interface StructuredCrawlBlock {
  label: string;
  role?: string;
  role_detail?: string;
  title: string;
  summary: string;
  details: string[];
  keywords: string[];
  source_url: string;
  priority?: number;
}

export interface StructuredCrawlResult {
  site_summary: string;
  blocks: StructuredCrawlBlock[];
  meta?: {
    source_url?: string;
    max_pages?: number;
    page_count?: number;
    page_type_counts?: Record<string, number>;
    language_warning?: string;
    aggregation_page_count?: number;
  };
}

function isStructuredCrawlBlock(value: unknown): value is StructuredCrawlBlock {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as StructuredCrawlBlock).label === 'string' &&
    typeof (value as StructuredCrawlBlock).title === 'string' &&
    typeof (value as StructuredCrawlBlock).summary === 'string' &&
    Array.isArray((value as StructuredCrawlBlock).details) &&
    Array.isArray((value as StructuredCrawlBlock).keywords) &&
    typeof (value as StructuredCrawlBlock).source_url === 'string'
  );
}

export function parseStructuredCrawlResult(rawContent: string): StructuredCrawlResult | null {
  if (!rawContent || !rawContent.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawContent) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const siteSummary = (parsed as StructuredCrawlResult).site_summary;
    const blocks = (parsed as StructuredCrawlResult).blocks;

    if (typeof siteSummary !== 'string' || !Array.isArray(blocks)) {
      return null;
    }

    const normalizedBlocks = blocks.filter(isStructuredCrawlBlock).map((block) => ({
      label: block.label.trim(),
      ...(block.role && { role: block.role }),
      ...(block.role_detail && { role_detail: block.role_detail }),
      title: block.title.trim(),
      summary: block.summary.trim(),
      details: block.details.map((detail) => (typeof detail === 'string' ? detail.trim() : '')).filter(Boolean),
      keywords: block.keywords.map((keyword) => (typeof keyword === 'string' ? keyword.trim() : '')).filter(Boolean),
      source_url: block.source_url.trim(),
      ...(block.priority && { priority: block.priority }),
    }));

    return {
      site_summary: siteSummary.trim(),
      blocks: normalizedBlocks,
      meta: (parsed as StructuredCrawlResult).meta,
    };
  } catch {
    return null;
  }
}

export function renderStructuredCrawlResult(result: StructuredCrawlResult, siteUrl: string): string {
  const lines: string[] = [];
  const summary = result.site_summary.trim();
  const blocks = result.blocks || [];

  lines.push('【サイト情報】');
  lines.push(`参照元: ${siteUrl}`);
  if (summary) {
    lines.push(summary);
  }
  lines.push('');
  lines.push('【情報ブロック】');

  for (const block of blocks) {
    lines.push(`## ${block.title || block.label || '無題'}`);
    if (block.label) {
      lines.push(`ラベル: ${block.label}`);
    }
    if (block.role) {
      lines.push(`役割: ${block.role}`);
    }
    if (block.role_detail) {
      lines.push(`役割詳細: ${block.role_detail}`);
    }
    if (block.priority) {
      lines.push(`優先度: ${block.priority}`);
    }
    if (block.summary) {
      lines.push(`要約: ${block.summary}`);
    }
    if (Array.isArray(block.details) && block.details.length > 0) {
      lines.push('詳細:');
      for (const detail of block.details) {
        if (detail) {
          lines.push(`- ${detail}`);
        }
      }
    }
    if (Array.isArray(block.keywords) && block.keywords.length > 0) {
      lines.push(`キーワード: ${block.keywords.join('、')}`);
    }
    if (block.source_url) {
      lines.push(`出典URL: ${block.source_url}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
