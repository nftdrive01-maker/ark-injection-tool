import { randomUUID } from 'crypto';
import { type Domain, getChronicleById, getKnowledgeById } from '@/lib/domains';
import { callChronicleChat } from '@/lib/beyond-core-client';
import { writeDomainSharedLog } from '@/lib/domain-shared-log';
import { executeMCPForDomain } from '@/lib/mcp-runtime';
import { getAttachedPackIds } from '@/lib/sessions';
import { type InjectionInterceptRequest, type InjectionInterceptResponse } from '@/types/injection';

function containsChineseText(text: string): boolean {
  if (!text || text.length < 4) return false;

  if (/[为时说语广场国车门线达这从仅们体龙]/.test(text)) {
    return true;
  }

  const fnWords = text.match(/(?:的|了|在|是|和|及|并|通过|可以|进行|访问)/g) ?? [];
  if (fnWords.length >= 2 && !/[\u3040-\u30ff]/.test(text)) {
    return true;
  }

  return false;
}

function filterChineseContent(text: string): string {
  const parts = text.split(/(?<=[。！？!?])|\n/);
  const kept: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (containsChineseText(trimmed)) continue;
    kept.push(trimmed);
  }

  return kept.join('\n').trim();
}

function requiresStrictFetchFormat(userText: string): boolean {
  return /(fetch\s*mcp|参照した\s*url|取得した内容の要約|推測\s*禁止|推測\s*は\s*禁止|必ず.*fetch|出力には以下を必ず含めてください)/i.test(userText);
}

const CHRONICLE_TRIGGER_MARKER = '[[USE_CHRONICLE]]';

function sanitizeChronicleMessage(userText: string): string {
  const normalized = (userText || '').split(CHRONICLE_TRIGGER_MARKER).join('').trim();
  return normalized || userText;
}

function hasExplicitChronicleTrigger(userText: string): boolean {
  const text = (userText || '').trim();
  if (!text) {
    return false;
  }

  if (text.includes(CHRONICLE_TRIGGER_MARKER)) {
    return true;
  }

  return /(?:クロニクル|chronicle).*(?:使って|参照|確認|実行|検証)|(?:オンチェーン|ブロックチェーン).*(?:確認|検証)|(?:検証|確認).*(?:クロニクル|chronicle|オンチェーン)/i.test(text);
}

function createStrictFetchInstruction(mcpSucceeded: boolean): string {
  if (!mcpSucceeded) {
    return `
====================
【回答制約（必須）】
この質問はFetch MCP結果が必須です。MCP結果が得られなかったため、回答は次の固定文のみを返してください。
「取得できませんでした」
追加説明・推測・補足は禁止です。
`;
  }

  return `
====================
【回答制約（必須）】
以下を必ず守って回答してください。
1. 自分の知識や推測で補完しない
2. 直上のMCP実行結果だけを根拠にする
3. 出力に必ず次の2項目を含める
   - 参照したURL
   - 取得した内容の要約
4. URLが判別できない場合は「参照したURL: 取得できませんでした」と明記する
`;
}

function normalizeUrlCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/[)>\]」』、。！？!?.,;:]+$/g, '');
}

function extractSourceUrls(text: string): string[] {
  if (!text) return [];

  const urls: string[] = [];
  const seen = new Set<string>();

  const urlLineRegex = /(?:^|\n)URL:\s*(https?:\/\/[^\s]+)/g;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = urlLineRegex.exec(text)) !== null) {
    const normalized = normalizeUrlCandidate(lineMatch[1] || '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  const genericRegex = /(https?:\/\/[^\s<>")\]]+)/g;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericRegex.exec(text)) !== null) {
    const normalized = normalizeUrlCandidate(genericMatch[1] || '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  return urls;
}

function isGoogleAuthRequiredOutput(text: string): boolean {
  if (!text) return false;

  return /(?:ACTION REQUIRED:\s*Google authentication needed|Google\s*アカウントが必要|Open the following URL in your browser|accounts\.google\.com\/(?:oauth2\/auth|o\/oauth2\/auth|o\/oauth2\/v2\/auth))/i.test(text);
}

function extractMcpCountSummary(output: string): string | null {
  if (!output) return null;

  try {
    const parsed = JSON.parse(output) as {
      data?: {
        rows?: Array<Record<string, unknown>>;
      };
    };

    const firstRow = Array.isArray(parsed?.data?.rows) ? parsed.data.rows[0] : null;
    if (!firstRow || typeof firstRow !== 'object') {
      return null;
    }

    for (const [key, value] of Object.entries(firstRow)) {
      if (!/(?:^|_)(?:count|total_count|total|件数|総数)(?:$|_)/i.test(key)) {
        continue;
      }

      const normalizedValue = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
      if (!/^\d+(?:\.\d+)?$/.test(normalizedValue)) {
        continue;
      }

      return `総件数は ${normalizedValue} 件です。`;
    }

    return null;
  } catch {
    const regexMatch = output.match(/"(?:total_count|count|total)"\s*:\s*"?(\d+(?:\.\d+)?)"?/i);
    if (!regexMatch?.[1]) {
      return null;
    }

    return `総件数は ${regexMatch[1]} 件です。`;
  }
}

function extractNumericCountValue(summary?: string | null): string | null {
  if (!summary) {
    return null;
  }

  const match = summary.match(/(\d+(?:\.\d+)?)\s*件/);
  return match?.[1] ?? null;
}

type DbPreviewRow = Record<string, string | number | boolean | null>;

function normalizeDbPreviewValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeDbQueryText(userText: string): string | undefined {
  const normalized = userText.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function inferDbSortLabel(userText: string): string | undefined {
  const normalized = userText.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  if (/(家賃|賃料).*(安い順|低い順)|安い順.*(家賃|賃料)/.test(normalized)) {
    return '家賃が安い順';
  }
  if (/(家賃|賃料).*(高い順)|高い順.*(家賃|賃料)/.test(normalized)) {
    return '家賃が高い順';
  }
  if (/(新しい順|築浅順|築年数.*新しい|新着順)/.test(normalized)) {
    return '築年数が新しい順';
  }
  if (/(古い順|築年数.*古い)/.test(normalized)) {
    return '築年数が古い順';
  }
  if (/(広い順|面積.*広い|専有面積.*広い)/.test(normalized)) {
    return '面積が広い順';
  }
  if (/(狭い順|面積.*狭い|専有面積.*狭い)/.test(normalized)) {
    return '面積が狭い順';
  }
  if (/(駅近|徒歩.*短い|近い順|駅から近い)/.test(normalized)) {
    return '駅から近い順';
  }

  return undefined;
}

function extractDbResultPayload(
  output: string,
  userText: string,
  serverId?: string,
  serverName?: string,
  toolName?: string,
): InjectionInterceptResponse['dbResult'] | undefined {
  if (!output) {
    return undefined;
  }

  if (serverId === 'estat' && toolName === 'search_statistics') {
    try {
      const parsed = JSON.parse(output) as Array<{
        id?: string;
        name?: string;
        organization?: string;
        survey_date?: string;
      }>;

      const rows = Array.isArray(parsed) ? parsed : [];
      if (rows.length === 0) {
        return undefined;
      }

      const previewRows: DbPreviewRow[] = rows.slice(0, 10).map((row) => ({
        statsId: typeof row.id === 'string' ? row.id : null,
        統計表名: typeof row.name === 'string' ? row.name : null,
        作成機関: typeof row.organization === 'string' ? row.organization : null,
        調査時点: typeof row.survey_date === 'string' ? row.survey_date : null,
      }));

      return {
        title: 'e-Stat検索結果',
        sourceName: serverName || serverId,
        toolName,
        summary: `e-Stat の統計表候補を ${rows.length} 件取得しました。上位 ${previewRows.length} 件を表示しています。`,
        queryText: normalizeDbQueryText(userText),
        totalCount: rows.length,
        previewColumns: ['statsId', '統計表名', '作成機関', '調査時点'],
        previewRows,
      };
    } catch {
      return undefined;
    }
  }

  if (serverId !== 'dbhub') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(output) as {
      data?: {
        rows?: Array<Record<string, unknown>>;
      };
    };

    const rows = Array.isArray(parsed?.data?.rows) ? parsed.data.rows : [];
    if (rows.length === 0) {
      return undefined;
    }

    const firstRow = rows[0] ?? {};
    const totalCountEntry = Object.entries(firstRow).find(([key, value]) => {
      if (!/^(?:count|total_count|total|row_count|件数|総数)$/i.test(key)) {
        return false;
      }

      const normalizedValue = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
      return /^\d+(?:\.\d+)?$/.test(normalizedValue);
    });

    const totalCount = totalCountEntry
      ? Number(typeof totalCountEntry[1] === 'number' ? totalCountEntry[1] : String(totalCountEntry[1]).trim())
      : undefined;

    const previewRowsSource = totalCountEntry && Object.keys(firstRow).length === 1 ? rows.slice(1) : rows;
    if (previewRowsSource.length === 0) {
      return undefined;
    }

    const previewRows: DbPreviewRow[] = previewRowsSource.map((row) => {
      const normalized: DbPreviewRow = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key] = normalizeDbPreviewValue(value);
      }
      return normalized;
    });

    const previewColumns = previewRows.length > 0
      ? Object.keys(previewRows[0])
      : Object.keys(firstRow).filter((key) => key !== totalCountEntry?.[0]);

    const summaryParts: string[] = [];
    if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
      summaryParts.push(`検索結果は合計 ${totalCount} 件です。`);
    }
    if (previewRows.length > 0) {
      summaryParts.push(`結果ビューには ${previewRows.length} 件を表示しています。`);
    }
    if (previewColumns.length > 0) {
      summaryParts.push(`主な列は ${previewColumns.slice(0, 6).join('、')} です。`);
    }

    return {
      title: 'DB検索結果',
      sourceName: serverName || serverId,
      toolName,
      summary: summaryParts.join(' '),
      queryText: normalizeDbQueryText(userText),
      sortLabel: inferDbSortLabel(userText),
      totalCount: typeof totalCount === 'number' && Number.isFinite(totalCount) ? totalCount : undefined,
      previewColumns,
      previewRows,
    };
  } catch {
    return undefined;
  }
}

function formatDbResultForPrompt(dbResult?: InjectionInterceptResponse['dbResult']): string | null {
  if (!dbResult) {
    return null;
  }

  const lines: string[] = [];

  if (typeof dbResult.totalCount === 'number' && Number.isFinite(dbResult.totalCount)) {
    lines.push(`【総件数】\n${dbResult.totalCount} 件`);
  }

  if (dbResult.sourceName || dbResult.toolName) {
    lines.push(`【データソース】\n${dbResult.sourceName || 'dbhub'}${dbResult.toolName ? ` / ${dbResult.toolName}` : ''}`);
  }

  return lines.length > 0 ? lines.join('\n\n') : null;
}

function formatMcpPreviewValue(value: string | number | boolean | null | undefined): string {
  if (value == null) {
    return '-';
  }

  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) {
    return '-';
  }

  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function summarizePreviewRow(row: DbPreviewRow, preferredColumns: string[]): string {
  const columns = preferredColumns.filter((column) => column in row);
  const fallbackColumns = Object.keys(row).filter((column) => !columns.includes(column));
  const selected = [...columns, ...fallbackColumns].slice(0, 4);

  return selected
    .map((column) => `${column}: ${formatMcpPreviewValue(row[column])}`)
    .join(' / ');
}

type WebSearchResultItem = {
  rank?: number;
  title?: string;
  url?: string;
  domain?: string;
  snippet?: string;
  page_summary?: string;
  page_excerpt?: string;
  page_summary_status?: string;
};

type WebSearchPayload = {
  query?: string;
  engine?: string;
  search_url?: string;
  fetched_at?: string;
  result_count?: number;
  selected_count?: number;
  results?: WebSearchResultItem[];
  notes?: string[];
};

export function parseWebSearchOutput(output: string): WebSearchPayload | null {
  if (!output) {
    return null;
  }

  try {
    const parsed = JSON.parse(output) as Partial<WebSearchPayload>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter((item): item is WebSearchResultItem => Boolean(item) && typeof item === 'object')
          .map((item, index) => ({
            rank: typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : index + 1,
            title: typeof item.title === 'string' ? item.title : '',
            url: typeof item.url === 'string' ? item.url : '',
            domain: typeof item.domain === 'string' ? item.domain : '',
            snippet: typeof item.snippet === 'string' ? item.snippet : '',
            page_summary: typeof item.page_summary === 'string' ? item.page_summary : '',
            page_excerpt: typeof item.page_excerpt === 'string' ? item.page_excerpt : '',
            page_summary_status: typeof item.page_summary_status === 'string' ? item.page_summary_status : '',
          }))
      : [];

    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((note): note is string => typeof note === 'string' && Boolean(note.trim()))
      : [];

    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      engine: typeof parsed.engine === 'string' ? parsed.engine : '',
      search_url: typeof parsed.search_url === 'string' ? parsed.search_url : '',
      fetched_at: typeof parsed.fetched_at === 'string' ? parsed.fetched_at : '',
      result_count: typeof parsed.result_count === 'number' && Number.isFinite(parsed.result_count) ? parsed.result_count : results.length,
      selected_count: typeof parsed.selected_count === 'number' && Number.isFinite(parsed.selected_count) ? parsed.selected_count : results.length,
      results,
      notes,
    };
  } catch {
    return null;
  }
}

export function formatWebSearchPayloadForPrompt(payload: WebSearchPayload): string {
  const lines: string[] = ['[WEB????]'];

  if (payload.query) {
    lines.push(`???: ${payload.query}`);
  }
  if (payload.fetched_at) {
    lines.push(`????: ${payload.fetched_at}`);
  }
  if (typeof payload.result_count === 'number') {
    lines.push(`??????: ${payload.result_count}`);
  }

  const results = Array.isArray(payload.results) ? payload.results.slice(0, 3) : [];
  if (results.length > 0) {
    lines.push('????:');
    for (const result of results) {
      const title = formatMcpPreviewValue(result.title);
      const url = formatMcpPreviewValue(result.url);
      const domain = formatMcpPreviewValue(result.domain);
      const rawSummary = formatMcpPreviewValue(result.page_summary || result.snippet);
      const summary = isLikelyEnglishText(rawSummary) ? '（英語のため要約を省略）' : rawSummary;
      lines.push(`- ${result.rank ?? ''}${result.rank ? '. ' : ''}${title}`.trim());
      if (domain !== '-') {
        lines.push(`  ???: ${domain}`);
      }
      if (url !== '-') {
        lines.push(`  URL: ${url}`);
      }
      if (summary !== '-') {
        lines.push(`  ??: ${summary}`);
      }
    }
  }

  if (Array.isArray(payload.notes) && payload.notes.length > 0) {
    lines.push('??:');
    for (const note of payload.notes.slice(0, 3)) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join('\n');

}

function isLikelyEnglishText(text: string): boolean {
  if (!text) {
    return false;
  }
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }

  const latinLetters = (normalized.match(/[A-Za-z]/g) || []).length;
  const japaneseChars = (normalized.match(/[ぁ-んァ-ヶ一-龯]/g) || []).length;

  return latinLetters >= 20 && latinLetters >= japaneseChars * 2;
}

function buildMcpReactionPrompt(params: {
  userText: string;
  serverId?: string;
  toolName?: string;
  dbResult?: InjectionInterceptResponse['dbResult'];
}): string | null {
  const { userText, serverId, toolName, dbResult } = params;
  if (!dbResult || !Array.isArray(dbResult.previewRows) || dbResult.previewRows.length === 0) {
    return null;
  }


  const totalCount = typeof dbResult.totalCount === 'number' && Number.isFinite(dbResult.totalCount)
    ? dbResult.totalCount
    : dbResult.previewRows.length;

  const isSearchLike = serverId === 'estat'
    || toolName === 'search_objects'
    || (toolName === 'execute_sql' && dbResult.previewRows.length > 1);

  const preferredColumns = serverId === 'estat'
    ? ['統計表名', '作成機関', '調査時点', 'statsId']
    : ['title', 'name', 'city', 'ward', 'rent', 'id'];

  const topSummaries = dbResult.previewRows
    .slice(0, 5)
    .map((row, index) => `- 候補${index + 1}: ${summarizePreviewRow(row, preferredColumns)}`)
    .join('\n');

  const reactionGuide = isSearchLike
    ? 'ユーザーに、あなた自身が検索して上位候補を見つけてきたように自然に報告してください。候補一覧を全文読み上げたり、そのまま列挙したりしてはいけません。どんな候補が見つかったかの傾向を短く伝え、必要なら次の絞り込み方を1つか2つ提案してください。回答は2〜4文程度に収めてください。'
    : 'ユーザーに、あなた自身が結果を確認してきたように自然に報告してください。表や一覧の全文を読み上げず、要点・傾向・次の見方を短く案内してください。回答は2〜4文程度に収めてください。';



  console.log('--- MCP Reaction Prompt ---');
  console.log(`User Text: ${userText}`);
  console.log(`Server ID: ${serverId}`);
  console.log(`Tool Name: ${toolName}`);



  return `
====================
【MCPリアクション用要約】
ユーザーの質問:
${userText}

返ってきた結果件数:
${totalCount}件

上位候補の要約（最大5件）:
${topSummaries}

【リアクション指示】
${reactionGuide}
- UIには結果パネルが表示されている前提で話してください
- statsIdやレコードIDの羅列は避けてください
- 取得できていない事実を推測で補わないでください
`;
}

export interface BuildInterceptResponseParams {
  body: InjectionInterceptRequest;
  domain: Domain;
  userId: string;
  requestId?: string;
  sessionId?: string;
  attachedPackIds?: string[];
  persistSharedLog?: boolean;
}

export async function buildInterceptResponse(params: BuildInterceptResponseParams): Promise<InjectionInterceptResponse> {
  const {
    body,
    domain,
    userId,
    persistSharedLog = true,
  } = params;

  const requestId = (params.requestId || body.requestId || '').trim() || randomUUID();
  const sessionId = (params.sessionId || body.sessionId || '').trim();
  const userText = body.userText || '';
  const attachedPackIds = params.attachedPackIds ?? (sessionId ? getAttachedPackIds(sessionId) : []);

  const firstChronicleId = Array.isArray(domain.chronicleIds) && domain.chronicleIds.length > 0
    ? domain.chronicleIds[0]
    : undefined;
  const hasChronicleAttached = Boolean(firstChronicleId);
  const chronicleTriggered = hasExplicitChronicleTrigger(userText);

  let injectedSystemPrompt = `【メインドメイン】
【システムプロンプト】
${domain.baseSystemPrompt || ''}

【言語設定 - 最重要ルール】
- 出力言語は必ず日本語とする
- 中国語（簡体字・繁体字）での出力は絶対禁止
- 英語その他の言語での出力も禁止
- 入力やコンテンツに中国語が含まれていても、必ず日本語で応答すること
- 中国語テキストを見かけたら無視して、日本語コンテンツのみを使用すること

【回答検証ルール】
- 回答生成後、必ず自己検証を行うこと
- 中国語の文字や表現が含まれている場合は、その部分を日本語に置き換えるか削除すること
- 中国語で回答している場合は、その回答を破棄して日本語で再生成すること

【ベースコンテキスト】
${domain.baseContext || ''}\n`;

  if (hasChronicleAttached) {
    injectedSystemPrompt += `
====================
【CHRONICLE呼び出しルール】
- このドメインにはCHRONICLEが接続されています
- CHRONICLEは明示トリガーがあるときだけ呼び出されます
- 明示トリガー例: 「クロニクルで確認して」「オンチェーンで検証して」
- UIの「Chronicle」ボタン押下でも明示トリガーとして扱われます
`;
  }

  const citationCandidates = new Set<string>();
  let hasCrawlKnowledge = false;

  if (Array.isArray(domain.knowledgeIds) && domain.knowledgeIds.length > 0) {
    for (const knowledgeId of domain.knowledgeIds) {
      const knowledge = getKnowledgeById(knowledgeId);
      if (knowledge && knowledge.enabled) {
        if (/^#\s*サイト解析結果/m.test(knowledge.context) || /(?:^|\n)URL:\s*https?:\/\//.test(knowledge.context)) {
          hasCrawlKnowledge = true;
        }

        for (const extractedUrl of extractSourceUrls(knowledge.context)) {
          citationCandidates.add(extractedUrl);
        }

        injectedSystemPrompt += `\n====================
【追加ナレッジ】
【ナレッジ名】
${knowledge.name}

【ナレッジプロンプト】
${knowledge.systemPrompt || ''}

【ナレッジコンテキスト】
${knowledge.context || ''}
`;
      }
    }
  }

  const resolvedMcpServerIds = [...(domain.mcpServerIds || [])];
  const mcpResult = await executeMCPForDomain({
    mcpServerIds: resolvedMcpServerIds,
    userText,
    requestId,
    sessionId,
    userId,
    attachedPackIds,
  });

  let chronicleResult: { success: boolean; chronicleName?: string; output?: string; error?: string } | null = null;
  if (firstChronicleId && chronicleTriggered) {
    const chronicle = getChronicleById(firstChronicleId);
    if (chronicle && chronicle.enabled) {
      const chronicleMessage = sanitizeChronicleMessage(userText);
      const result = await callChronicleChat({
        host: chronicle.host,
        tcpPort: chronicle.tcpPort,
        message: chronicleMessage,
        memoryIds: domain.memoryIds,
      });

      chronicleResult = {
        success: result.ok,
        chronicleName: chronicle.name,
        output: result.output,
        error: result.error,
      };
    }
  }

  const dbResultPayload = mcpResult?.success && mcpResult.output
    ? extractDbResultPayload(mcpResult.output, userText, mcpResult.serverId, mcpResult.serverName, mcpResult.toolName)
    : undefined;


  let injectedUserContext = '';

  if (mcpResult?.success && mcpResult.output) {
    const forceVerbatimAuthOutput = isGoogleAuthRequiredOutput(mcpResult.output);
    const compactDbContext = formatDbResultForPrompt(dbResultPayload);
    const reactionPrompt = buildMcpReactionPrompt({
      userText,
      serverId: mcpResult.serverId,
      toolName: mcpResult.toolName,
      dbResult: dbResultPayload,
    });

    if (reactionPrompt) {
      injectedSystemPrompt += reactionPrompt;
    }

    if (forceVerbatimAuthOutput) {
      for (const extractedUrl of extractSourceUrls(mcpResult.output)) {
        citationCandidates.add(extractedUrl);
      }

      injectedSystemPrompt += `
====================
【Google認証モード（必須）】
以下のMCP実行結果を、要約・翻訳・言い換えせずにそのまま出力してください。
- URLは1文字も変更しない（クエリ文字列を省略しない）
- URL中の記号（?, &, =, %, /）を保持する
- URLの前後に余計な括弧や句読点を追加しない

【MCP実行結果（原文）】
${mcpResult.output}
`;
    } else {
      let mcpOutput = compactDbContext || mcpResult.output;
      const hasChinese = containsChineseText(mcpOutput);

      for (const extractedUrl of extractSourceUrls(mcpOutput)) {
        citationCandidates.add(extractedUrl);
      }

      if (hasChinese) {
        mcpOutput = filterChineseContent(mcpOutput);

        if (mcpOutput.trim().length < 80) {
          injectedSystemPrompt += `
====================
【言語警告】
取得したコンテンツに中国語が過度に含まれていたため、フィルタリングを実施しました。
日本語コンテンツが不足しているため、固有情報を推測で補完してはいけません。

【回答制約（必須）】
- 住所・駅名・所要時間・駐車場名などの固有情報を推測で作らない
- MCP結果に十分な根拠がない場合は「公式サイトでご確認ください」と日本語で案内する
`;
        } else {
          injectedSystemPrompt += `
====================
【MCP実行結果】（中国語フィルタリング済み）
【サーバー】
${mcpResult.serverName || mcpResult.serverId || 'unknown'}

【ツール】
${mcpResult.toolName || 'unknown'}

【結果】
${mcpOutput}

【重要な指示】
上記の情報をベースに回答してください。
- コンテンツ内の中国語は既にフィルタリングされています
- 中国語で応答しないでください（日本語のみで回答）
`;
        }
      } else {
        const mcpCountSummary = extractMcpCountSummary(mcpResult.output);
        const exactCountValue = extractNumericCountValue(mcpCountSummary);
        injectedSystemPrompt += `
====================
【MCP実行結果】
【サーバー】
${mcpResult.serverName || mcpResult.serverId || 'unknown'}

【ツール】
${mcpResult.toolName || 'unknown'}

【結果】
${compactDbContext || mcpResult.output}

${mcpCountSummary ? `【回答用サマリー】
${mcpCountSummary}

` : ''}【重要な指示】
上記の情報をベースに回答してください。
- 件数を答える質問では、【回答用サマリー】があればその件数を優先してそのまま回答してください
- ${exactCountValue ? `件数を答える場合、使用してよい件数は ${exactCountValue} のみです。20 など他の数値に置き換えてはいけません` : '件数を答える場合、DB結果にない数値を推測で補わないでください'}
- 多言語マーカー（/en など）は無視してください
- 日本語のテキストのみを処理してください
- 日本語で回答してください（英語や中国語での回答は厳禁です）
`;
      }
    }
  }

const chroniclePayload = chronicleResult?.success && chronicleResult.output
    ? {
        title: 'CHRONICLE',
        content: chronicleResult.output,
        sourceName: chronicleResult.chronicleName,
      }
    : undefined;


  injectedSystemPrompt += `
====================
【根拠制約】
- 回答はMCP実行結果に含まれる情報だけを根拠にすること
- 根拠が不足する項目は断定せず、日本語で確認先を案内すること
- 中国語文字が混入した場合は出力を破棄し、日本語のみで再生成すること
`;

  const strictFetchRequired = requiresStrictFetchFormat(userText);
  const shouldRequireCitations = hasCrawlKnowledge || mcpResult?.toolName === 'crawl_site' || citationCandidates.size > 0;

  if (shouldRequireCitations) {
    const sourceList = Array.from(citationCandidates).slice(0, 12);
    const sourceBlock = sourceList.length > 0
      ? sourceList.map((url) => `- ${url}`).join('\n')
      : '- （URL抽出なし）';

    injectedSystemPrompt += `
====================
【出典URLルール（必須）】
- サイト解析由来の情報を使って回答した場合、回答末尾に必ず「出典URL」を記載する
- 回答に利用したページURLのみを列挙する（推測URLは禁止）
- 出典が複数ある場合は複数行で列挙する
- URL文字列は候補をそのまま使用し、途中に空白を入れない（例: https://www.example.com）
- URL中の英字・記号はそのまま保持する（翻訳・変換・分割をしない）

【出典URL候補】
${sourceBlock}

【出力形式（末尾に必ず追加）】
出典URL:
- https://example.com/page-a
- https://example.com/page-b
`;
  }

  if (strictFetchRequired) {
    injectedSystemPrompt += createStrictFetchInstruction(Boolean(mcpResult?.success && mcpResult.output));
  }

  injectedSystemPrompt += `
====================
【出力フォーマット】
回答は話題・内容が変わるタイミングで必ず改行（空行）を入れ、読みやすい段落構造にしてください。1つの段落は3〜5文程度を目安にしてください。

【最終検証 - 中国語フィルタリング（絶対禁止）】
回答を送出する前に必ず以下をチェックしてください。この検証に失敗した場合は回答を破棄して再生成してください：

1. 以下の簡体字中国語文字が含まれていないか：
   的、说、是、在、一、个、为、了、时、被、种、传、统、话、语、诗、签、占、卜、方、式、通、常、神、社、寺、庙、进、行、祈、愿、获、得、著、名、财、广、溡、汇、国、际、城、市、地、区、域、宫、庙
   （上記の文字が1個でも含まれていたら、その部分を日本語に置き換えるか削除してください）

2. 英語が含まれていないか（固有名詞を除く）

3. すべて日本語で記述されているか

4. コンテンツがすべて日本語で、読みやすい文章構成か

上記の確認が完了したら、安心して回答を出力してください。
万が一、検証で問題が見つかった場合は、日本語のみで新しく回答を作成してください。
`;

  const response: InjectionInterceptResponse = {
    injectedSystemPrompt,
    injectedUserContext,
    dbResult: dbResultPayload,
    chronicle: chroniclePayload,
    metadata: {
      requestId,
      sessionId,
      domainId: domain.id,
      ttl: domain.ttl,
      version: domain.version,
      mcpUsed: Boolean(mcpResult?.success),
      mcpServerId: mcpResult?.serverId,
      mcpToolName: mcpResult?.toolName,
      mcpError: mcpResult && !mcpResult.success ? mcpResult.error : undefined,
      mcpErrorCode: mcpResult && !mcpResult.success ? mcpResult.errorCode : undefined,
      attachedPackIds,
      chronicleUsed: Boolean(chronicleResult?.success),
      chronicleName: chronicleResult?.chronicleName,
      chronicleError: chronicleResult && !chronicleResult.success ? chronicleResult.error : undefined,
      chronicleAttached: hasChronicleAttached,
      chronicleTriggered,
      strictFetchRequired,
      strictFetchInjected: strictFetchRequired,
    },
  };

  if (persistSharedLog && domain.sharedLogEnabled) {
    try {
      await writeDomainSharedLog({
        domainId: domain.id,
        requestId,
        sessionId: sessionId || null,
        userId,
        userText,
        requestBody: body,
        responseBody: response,
        mcpResult,
        chronicleResult,
      });
    } catch (logError) {
      console.error('Shared log write error:', logError);
    }
  }

  return response;
}
