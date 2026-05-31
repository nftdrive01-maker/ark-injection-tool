import type { ReactNode } from 'react';
import { getHelpDocs, type HelpDoc } from '@/lib/help-docs';

type HelpPageProps = {
  searchParams?: {
    doc?: string | string[];
    q?: string | string[];
  };
};

function toSearchValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function buildDocHrefMap(docs: HelpDoc[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const doc of docs) {
    const href = `/help?doc=${encodeURIComponent(doc.id)}`;
    map.set(doc.fileName, href);
    map.set(`./${doc.fileName}`, href);
    map.set(doc.relativePath, href);
    map.set(`./${doc.relativePath}`, href);
  }

  return map;
}

function renderInlineMarkdown(text: string, docHrefMap: Map<string, string>): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^\)]+\)|`[^`]+`)/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`${index}-code`}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            backgroundColor: '#eef2ff',
            color: '#312e81',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '0.92em',
          }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const parts = /^\[([^\]]+)\]\(([^\)]+)\)$/.exec(token);
      const label = parts?.[1] || token;
      const rawHref = parts?.[2] || '#';
      const href = docHrefMap.get(rawHref) || rawHref;
      const isExternal = /^https?:\/\//.test(href);

      nodes.push(
        <a
          key={`${index}-link`}
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noreferrer' : undefined}
          style={{ color: '#2563eb', textDecoration: 'underline' }}
        >
          {label}
        </a>,
      );
    }

    cursor = index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function renderMarkdown(content: string, docHrefMap: Map<string, string>) {
  const lines = content.split(/\r?\n/);
  const elements: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let codeLines: string[] = [];
  let codeFenceOpen = false;
  let codeLanguage = '';
  const headingCounts = new Map<string, number>();

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const text = paragraphLines.join(' ').trim();
    if (text) {
      elements.push(
        <p key={`p-${elements.length}`} style={{ margin: '0 0 14px 0', color: '#334155', lineHeight: 1.8 }}>
          {renderInlineMarkdown(text, docHrefMap)}
        </p>,
      );
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0 || !listType) {
      return;
    }

    const Tag = listType;
    elements.push(
      <Tag key={`list-${elements.length}`} style={{ margin: '0 0 16px 0', paddingLeft: '22px', color: '#334155', lineHeight: 1.8 }}>
        {listItems.map((item, index) => (
          <li key={`${elements.length}-${index}`}>{renderInlineMarkdown(item, docHrefMap)}</li>
        ))}
      </Tag>,
    );
    listItems = [];
    listType = null;
  };

  const flushCode = () => {
    if (!codeFenceOpen) {
      return;
    }

    elements.push(
      <div key={`code-${elements.length}`} style={{ margin: '0 0 18px 0' }}>
        {codeLanguage ? (
          <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {codeLanguage}
          </div>
        ) : null}
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            borderRadius: '12px',
            backgroundColor: '#0f172a',
            color: '#e2e8f0',
            overflowX: 'auto',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      </div>,
    );

    codeLines = [];
    codeFenceOpen = false;
    codeLanguage = '';
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (codeFenceOpen) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        codeFenceOpen = true;
        codeLanguage = trimmed.slice(3).trim();
      }
      continue;
    }

    if (codeFenceOpen) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      const baseSlug = slugify(title);
      const count = headingCounts.get(baseSlug) ?? 0;
      headingCounts.set(baseSlug, count + 1);
      const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;

      if (level === 1) {
        elements.push(<h1 key={slug} id={slug} style={{ margin: '0 0 18px 0', fontSize: '32px', lineHeight: 1.2, color: '#0f172a' }}>{title}</h1>);
      } else if (level === 2) {
        elements.push(<h2 key={slug} id={slug} style={{ margin: '28px 0 14px 0', fontSize: '22px', lineHeight: 1.3, color: '#0f172a' }}>{title}</h2>);
      } else {
        elements.push(<h3 key={slug} id={slug} style={{ margin: '22px 0 12px 0', fontSize: '18px', lineHeight: 1.4, color: '#0f172a' }}>{title}</h3>);
      }
      continue;
    }

    const unorderedMatch = /^-\s+(.+)$/.exec(trimmed);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(orderedMatch[1]);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          style={{
            margin: '0 0 16px 0',
            padding: '10px 14px',
            borderLeft: '4px solid #93c5fd',
            backgroundColor: '#eff6ff',
            color: '#1e3a8a',
            borderRadius: '0 10px 10px 0',
            lineHeight: 1.8,
          }}
        >
          {renderInlineMarkdown(trimmed.replace(/^>\s?/, ''), docHrefMap)}
        </blockquote>,
      );
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushParagraph();
      flushList();
      elements.push(
        <pre
          key={`table-${elements.length}`}
          style={{
            margin: '0 0 16px 0',
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            overflowX: 'auto',
            fontSize: '13px',
            lineHeight: 1.7,
            color: '#334155',
          }}
          dangerouslySetInnerHTML={{ __html: escapeHtml(trimmed) }}
        />,
      );
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (codeFenceOpen) {
    flushCode();
  }

  return elements;
}

export default function HelpPage({ searchParams }: HelpPageProps) {
  const docs = getHelpDocs();
  const docQuery = toSearchValue(searchParams?.doc);
  const searchQuery = toSearchValue(searchParams?.q).trim().toLowerCase();

  const filteredDocs = searchQuery
    ? docs.filter((doc) => {
        const haystack = `${doc.title}\n${doc.summary}\n${doc.category}\n${doc.content}`.toLowerCase();
        return haystack.includes(searchQuery);
      })
    : docs;

  const currentDoc = filteredDocs.find((doc) => doc.id === docQuery)
    || docs.find((doc) => doc.id === docQuery)
    || filteredDocs[0]
    || docs[0];

  const docsByCategory = filteredDocs.reduce<Record<string, HelpDoc[]>>((accumulator, doc) => {
    if (!accumulator[doc.category]) {
      accumulator[doc.category] = [];
    }
    accumulator[doc.category].push(doc);
    return accumulator;
  }, {});

  const docHrefMap = buildDocHrefMap(docs);

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 56px)',
        padding: '24px',
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.12), transparent 26%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 24%), #f8fafc',
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '20px' }}>
        <aside
          style={{
            alignSelf: 'start',
            position: 'sticky',
            top: '76px',
            backgroundColor: 'rgba(255,255,255,0.94)',
            border: '1px solid #e2e8f0',
            borderRadius: '18px',
            padding: '18px',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.14em', color: '#2563eb', textTransform: 'uppercase' }}>
            Help Center
          </div>
          <h1 style={{ margin: '10px 0 6px 0', fontSize: '24px', lineHeight: 1.25, color: '#0f172a' }}>運用ヘルプ</h1>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.7, color: '#475569' }}>
            ark-injection-ai-system の docs と運用マニュアルを injection-tool 内から参照できます。
          </p>

          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href="/admin"
              style={{
                textDecoration: 'none',
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                fontWeight: 700,
              }}
            >
              管理画面へ戻る
            </a>
            <a
              href="/"
              style={{
                textDecoration: 'none',
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: '#f8fafc',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                fontWeight: 700,
              }}
            >
              トップへ
            </a>
          </div>

          <form action="/help" style={{ marginTop: '16px' }}>
            <input
              type="search"
              name="q"
              defaultValue={searchQuery}
              placeholder="docs を検索"
              style={{
                width: '100%',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                padding: '10px 12px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </form>

          <div style={{ marginTop: '18px', display: 'grid', gap: '16px' }}>
            {Object.entries(docsByCategory).map(([category, categoryDocs]) => (
              <section key={category}>
                <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {category}
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {categoryDocs.map((doc) => {
                    const isActive = doc.id === currentDoc?.id;
                    const nextHref = `/help?doc=${encodeURIComponent(doc.id)}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`;

                    return (
                      <a
                        key={doc.id}
                        href={nextHref}
                        style={{
                          textDecoration: 'none',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          border: isActive ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                          backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                          color: '#0f172a',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '14px', lineHeight: 1.5 }}>{doc.title}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: 1.6, color: '#64748b' }}>{doc.summary}</div>
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <section
          style={{
            minWidth: 0,
            backgroundColor: 'rgba(255,255,255,0.96)',
            border: '1px solid #e2e8f0',
            borderRadius: '18px',
            padding: '24px 28px',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
          }}
        >
          {currentDoc ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '18px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em', color: '#2563eb', textTransform: 'uppercase' }}>
                    {currentDoc.category}
                  </div>
                  <h2 style={{ margin: '8px 0 8px 0', fontSize: '30px', lineHeight: 1.2, color: '#0f172a' }}>{currentDoc.title}</h2>
                  <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>{currentDoc.summary}</p>
                </div>

                <div style={{ minWidth: '240px', flex: '0 0 280px', padding: '14px 16px', borderRadius: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ marginBottom: '10px', fontSize: '12px', fontWeight: 800, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    目次
                  </div>
                  {currentDoc.headings.length > 0 ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {currentDoc.headings.map((heading) => (
                        <a
                          key={`${heading.slug}-${heading.level}`}
                          href={`#${heading.slug}`}
                          style={{
                            textDecoration: 'none',
                            color: '#334155',
                            fontSize: heading.level === 1 ? '14px' : '13px',
                            paddingLeft: heading.level === 1 ? 0 : heading.level === 2 ? 10 : 20,
                          }}
                        >
                          {heading.title}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#64748b' }}>このドキュメントに見出しはありません。</div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '18px', fontSize: '12px', color: '#64748b' }}>
                元ファイル: {currentDoc.relativePath}
              </div>

              <article>{renderMarkdown(currentDoc.content, docHrefMap)}</article>
            </>
          ) : (
            <div style={{ color: '#64748b', fontSize: '15px' }}>一致するドキュメントがありません。</div>
          )}
        </section>
      </div>
    </div>
  );
}