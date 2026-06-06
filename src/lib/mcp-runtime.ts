import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  MCPAIRoutingConfig,
  MCPRuleRoutingRule,
  MCPServer,
  getMCPServerById,
  setMCPServerRuntimeStatus,
} from './mcp-servers';
import { MCPAuditErrorCode, writeMCPAuditLog } from './mcp-audit-log';

export interface MCPExecutionResult {
  success: boolean;
  serverId?: string;
  serverName?: string;
  toolName?: string;
  output?: string;
  error?: string;
  errorCode?: MCPAuditErrorCode;
}

const MCP_ALWAYS_ON = process.env.INJECTION_MCP_ALWAYS_ON === 'true';
const MCP_DEFAULT_TOOL = process.env.INJECTION_MCP_DEFAULT_TOOL || 'get_current_time';
const MCP_ROUTER_TIMEOUT_MS = parseInt(process.env.INJECTION_MCP_ROUTER_TIMEOUT || '6000', 10);
const GOOGLE_WORKSPACE_PACK_ID = (process.env.INJECTION_GOOGLE_WORKSPACE_PACK_ID || 'google_workspace').trim().toLowerCase();
const GOOGLE_READONLY_TOOL_ALLOWLIST = (process.env.INJECTION_GOOGLE_READONLY_TOOLS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

interface ToolDecision {
  name: string;
  args: Record<string, unknown>;
}

interface DBHubExplorationContext {
  summary: string;
}

interface EstatSearchResultItem {
  id?: string;
  name?: string;
  organization?: string;
  survey_date?: string;
}

interface EstatMetaItem {
  code?: string;
  name?: string;
  level?: string;
  unit?: string;
}

interface EstatMetaResponse {
  stats_id?: string;
  table_items?: EstatMetaItem[];
  classification_items?: Record<string, EstatMetaItem[]>;
  time_items?: EstatMetaItem[];
  area_items?: EstatMetaItem[];
}

interface EstatDataValue {
  value?: string | number;
  table_code?: string;
  time_code?: string;
  area_code?: string;
  [key: string]: unknown;
}

interface EstatDataResponse {
  stats_id?: string;
  total_count?: number;
  values?: EstatDataValue[];
  has_more?: boolean;
  next_key?: number | string | null;
}

type EstatIntent = 'search' | 'meta' | 'data';

const SEARCH_TOOL_ALIASES = ['search_web', 'web_search', 'search'] as const;

function buildWebSearchUrl(query: string): string {
  const q = encodeURIComponent(query.trim() || '最新情報');
  return `https://duckduckgo.com/html/?q=${q}`;
}

function shouldUseMCP(userText: string): boolean {
  if (MCP_ALWAYS_ON) {
    return true;
  }

  return /(mcp|検索|調べて|search|lookup|find|sql|dbhub|drive|gmail|calendar|統計|人口|cpi|gdp|失業率|時刻|時間|何時|天気|weather|計算|calculate|calc|式|ツール一覧|list tools)/i.test(userText);
}

function hasRuleKeywordMatch(server: MCPServer, userText: string): boolean {
  const ruleRouting = server.ruleRouting;
  if (!ruleRouting?.enabled || !Array.isArray(ruleRouting.rules) || ruleRouting.rules.length === 0) {
    return false;
  }

  const normalizedText = userText.toLowerCase();
  const enabledRules = ruleRouting.rules.filter((rule) => rule.enabled);
  return enabledRules.some((rule) => Array.isArray(rule.keywords)
    && rule.keywords.some((keyword) => keyword && normalizedText.includes(keyword.toLowerCase())));
}

function shouldAttemptRuleRouting(server: MCPServer, userText: string): boolean {
  if (MCP_ALWAYS_ON) {
    return true;
  }

  const ruleRouting = server.ruleRouting;
  if (ruleRouting?.enabled && Array.isArray(ruleRouting.rules) && ruleRouting.rules.length > 0) {
    const hasKeywordRules = ruleRouting.rules.some((rule) => rule.enabled && Array.isArray(rule.keywords) && rule.keywords.length > 0);
    if (hasKeywordRules) {
      return hasRuleKeywordMatch(server, userText);
    }
  }

  return shouldUseMCP(userText);
}

function extractSearchQuery(userText: string): string {
  const raw = (userText || '').replace(/\[(?:neutral|joyful|sad|angry)\]/gi, '').trim();
  const looksLikeAssistantNarration = /(?:私、|ご希望|ご提案|お聞かせください|ご活用いただけます|まず.+まとめ|次に.+そして)/.test(raw);
  const quotedTopic = raw.match(/[「\"]([^「」\"\n]{2,80})[」\"]/)?.[1]?.trim();

  if (looksLikeAssistantNarration && quotedTopic) {
    return quotedTopic;
  }

  const byTriedSearchPattern = raw.match(/([^\n。！？]{2,80}?)を調べ(?:ようとした|ました|た結果)/);
  if (byTriedSearchPattern?.[1]?.trim()) {
    return byTriedSearchPattern[1].trim();
  }

  const byWebSearchPattern = userText.match(/([^\n。！？]+?)\s*を\s*(?:web|ウェブ|internet|インターネット)\s*で\s*(?:検索|調べ)(?:て|る|してください)?/i);
  if (byWebSearchPattern?.[1]?.trim()) {
    return byWebSearchPattern[1].trim();
  }

  const lines = userText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const lastSearchLine = [...lines].reverse().find((line) => /(検索|調べて|search|lookup|find)/i.test(line));
  if (lastSearchLine) {
    const simplified = lastSearchLine
      .replace(/^(?:mcpで|MCPで)\s*/i, '')
      .replace(/(?:で)?\s*(?:検索して|調べて|探して)\s*$/i, '')
      .replace(/^(?:検索|search|lookup|find)\s*(?:[:：]\s*)?/i, '')
      .replace(/\s*を\s*(?:web|ウェブ|internet|インターネット)\s*で\s*(?:検索|調べ)(?:て|る|してください)?\s*$/i, '')
      .trim();

    if (simplified) {
      return simplified;
    }
  }

  const normalized = userText
    .replace(/^\s+|\s+$/g, '')
    .replace(/^(?:mcpで|MCPで)\s*/i, '')
    .replace(/(?:で)?\s*(?:検索して|調べて|探して)\s*$/i, '')
    .replace(/^(?:検索|search|lookup|find)\s*(?:[:：]\s*)?/i, '')
    .trim();

  if (looksLikeAssistantNarration) {
    const topicLike = normalized.match(/([^\n。！？]{2,80}?)(?:に関する|について)/)?.[1]?.trim();
    if (topicLike) {
      return topicLike;
    }
  }

  const condensed = (normalized || raw || '最新情報')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return condensed.length > 120 ? condensed.slice(0, 120) : condensed;
}

function normalizeEstatSearchKeyword(userText: string, args: Record<string, unknown>): string {
  const directKeyword = typeof args.keyword === 'string' && args.keyword.trim()
    ? args.keyword.trim()
    : typeof args.query === 'string' && args.query.trim()
      ? args.query.trim()
      : typeof args.q === 'string' && args.q.trim()
        ? args.q.trim()
        : extractSearchQuery(userText);

  const metricAliases: Array<{ pattern: RegExp; keyword: string }> = [
    { pattern: /(?:\bCPI\b|消費者物価指数)/i, keyword: '消費者物価指数' },
    { pattern: /(?:\bGDP\b|国内総生産)/i, keyword: '国内総生産' },
    { pattern: /人口推計/i, keyword: '人口推計' },
    { pattern: /(?:人口統計|人口)/i, keyword: '人口' },
    { pattern: /(?:完全失業率|失業率)/i, keyword: '完全失業率' },
    { pattern: /労働力調査/i, keyword: '労働力調査' },
  ];

  const matchedMetric = metricAliases.find((entry) => entry.pattern.test(userText) || entry.pattern.test(directKeyword));
  const qualifiers: string[] = [];

  if (/都道府県別/.test(userText)) {
    qualifiers.push('都道府県別');
  }

  if (/東京/.test(userText)) {
    qualifiers.push('東京');
  } else if (/大阪/.test(userText)) {
    qualifiers.push('大阪');
  } else if (/全国/.test(userText)) {
    qualifiers.push('全国');
  }

  const yearMatch = userText.match(/(?:19|20)\d{2}年/);
  if (yearMatch?.[0]) {
    qualifiers.push(yearMatch[0]);
  }

  if (matchedMetric) {
    return [matchedMetric.keyword, ...qualifiers].join(' ').trim();
  }

  return directKeyword
    .replace(/[?？!！。]/g, ' ')
    .replace(/(?:最新|直近)(?:時点)?/g, ' ')
    .replace(/(?:を|の)?(?:教えて|見せて|探して|調べて|確認して|知りたい|一覧で見せて|一覧で教えて|一覧)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)\]}>"']+/i);
  return match?.[0] || null;
}

function parseJsonSafe<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function inferEstatIntent(userText: string): EstatIntent {
  if (/(?:表の構造|分類項目|時間軸|地域項目|地域コード|コード一覧|取得条件|メタデータ|項目を教えて)/.test(userText)) {
    return 'meta';
  }

  if (/(?:教えて|見せて|一覧|推移|比較|最新|直近|データ|値|件数|割合|ランキング|上位|増減)/.test(userText)) {
    return 'data';
  }

  return 'search';
}

function compactJapaneseText(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function extractRequestedAreaTerms(userText: string): string[] {
  const requested: string[] = [];

  if (/全国|日本/.test(userText)) {
    requested.push('全国');
  }

  const explicitAreas = [
    '東京', '東京都', '東京区部', '大阪', '大阪府', '北海道', '京都', '京都府', '愛知', '愛知県',
    '福岡', '福岡県', '神奈川', '神奈川県', '埼玉', '埼玉県', '千葉', '千葉県', '兵庫', '兵庫県',
  ];

  for (const area of explicitAreas) {
    if (userText.includes(area) && !requested.includes(area)) {
      requested.push(area);
    }
  }

  return requested;
}

function scoreEstatNamedItem(itemName: string, requestedTerms: string[]): number {
  const compactName = compactJapaneseText(itemName);
  let score = 0;

  for (const term of requestedTerms) {
    const compactTerm = compactJapaneseText(term);
    if (!compactTerm) {
      continue;
    }

    if (compactName === compactTerm) {
      score = Math.max(score, 100);
    } else if (compactName.includes(compactTerm) || compactTerm.includes(compactName)) {
      score = Math.max(score, 80);
    }

    if ((compactTerm === '東京' || compactTerm === '東京都') && /東京/.test(compactName)) {
      score = Math.max(score, /区部/.test(compactName) ? 95 : 85);
    }

    if ((compactTerm === '大阪' || compactTerm === '大阪府') && /大阪/.test(compactName)) {
      score = Math.max(score, 90);
    }

    if (compactTerm === '全国' && /全国|日本/.test(compactName)) {
      score = Math.max(score, 90);
    }
  }

  return score;
}

function pickEstatAreaCodes(meta: EstatMetaResponse, userText: string): string[] {
  if (!Array.isArray(meta.area_items) || meta.area_items.length === 0) {
    return [];
  }

  if (/都道府県別/.test(userText)) {
    return [];
  }

  const requestedTerms = extractRequestedAreaTerms(userText);
  if (requestedTerms.length === 0) {
    return [];
  }

  const ranked = meta.area_items
    .map((item) => ({
      code: typeof item.code === 'string' ? item.code : '',
      score: typeof item.name === 'string' ? scoreEstatNamedItem(item.name, requestedTerms) : 0,
    }))
    .filter((item) => item.code && item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return [];
  }

  const wantsComparison = /比較|対比/.test(userText) || requestedTerms.length > 1;
  if (wantsComparison) {
    return ranked.slice(0, 2).map((item) => item.code);
  }

  return [ranked[0].code];
}

function extractYearFromText(userText: string): string | null {
  const yearMatch = userText.match(/((?:19|20)\d{2})年/);
  return yearMatch?.[1] || null;
}

function pickEstatTimeCode(meta: EstatMetaResponse, userText: string): string | null {
  if (!Array.isArray(meta.time_items) || meta.time_items.length === 0) {
    return null;
  }

  const explicitYear = extractYearFromText(userText);
  const normalizedItems = meta.time_items
    .map((item) => ({
      code: typeof item.code === 'string' ? item.code : '',
      name: typeof item.name === 'string' ? item.name : '',
      numeric: parseInt(((typeof item.code === 'string' ? item.code : '') + (typeof item.name === 'string' ? item.name : '')).replace(/\D/g, '').slice(0, 8) || '0', 10),
    }))
    .filter((item) => item.code);

  if (explicitYear) {
    const exact = normalizedItems.find((item) => item.code.startsWith(explicitYear) || item.name.includes(explicitYear));
    if (exact) {
      return exact.code;
    }
  }

  if (/(?:最新|直近|最近|現在)/.test(userText)) {
    const latest = [...normalizedItems].sort((left, right) => right.numeric - left.numeric)[0];
    return latest?.code || null;
  }

  return null;
}

function pickEstatTableCode(meta: EstatMetaResponse, userText: string): string | null {
  if (!Array.isArray(meta.table_items) || meta.table_items.length === 0) {
    return null;
  }

  const preferredTerms = [
    '総合', '総数', '指数', '人口', '消費者物価指数', '完全失業率', '国内総生産',
  ].filter((term) => userText.includes(term));

  if (preferredTerms.length === 0) {
    return null;
  }

  const match = meta.table_items.find((item) => {
    const name = typeof item.name === 'string' ? item.name : '';
    return preferredTerms.some((term) => name.includes(term));
  });

  return typeof match?.code === 'string' ? match.code : null;
}

function extractSurveyYear(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const match = value.match(/(?:19|20)\d{2}/);
  return match ? parseInt(match[0], 10) : 0;
}

function scoreEstatSearchResult(item: EstatSearchResultItem, userText: string): number {
  const name = typeof item.name === 'string' ? item.name : '';
  const organization = typeof item.organization === 'string' ? item.organization : '';
  const title = compactJapaneseText(`${name} ${organization}`);
  const surveyYear = extractSurveyYear(typeof item.survey_date === 'string' ? item.survey_date : undefined);
  const currentYear = new Date().getFullYear();
  let score = 0;

  const topicMatchers: Array<{ request: RegExp; title: RegExp; bonus: number }> = [
    { request: /(?:人口推計|人口統計|人口)/, title: /(?:人口推計|人口|国勢調査|住民基本台帳)/, bonus: 90 },
    { request: /(?:\bCPI\b|消費者物価指数)/i, title: /(?:消費者物価指数|CPI)/i, bonus: 100 },
    { request: /(?:\bGDP\b|国内総生産)/i, title: /(?:国内総生産|県民経済計算|国民経済計算|GDP)/i, bonus: 95 },
    { request: /(?:完全失業率|失業率|労働力調査)/, title: /(?:完全失業率|失業率|労働力調査)/, bonus: 95 },
  ];

  for (const matcher of topicMatchers) {
    if (matcher.request.test(userText) && matcher.title.test(title)) {
      score += matcher.bonus;
    }
  }

  if (/都道府県別/.test(userText)) {
    if (/(?:都道府県|各都道府県|地域別|県別|全国)/.test(title)) {
      score += 50;
    } else {
      score -= 25;
    }
  }

  if (/(?:東京|東京都|大阪|大阪府|全国|日本)/.test(userText)) {
    const requestedAreas = extractRequestedAreaTerms(userText);
    const areaScore = scoreEstatNamedItem(name, requestedAreas);
    score += Math.floor(areaScore / 4);
  }

  if (/(?:推移|時系列|比較|直近5年|長期)/.test(userText)) {
    if (/(?:時系列|推移|年次|月次|四半期|長期)/.test(title)) {
      score += 35;
    }
  }

  if (/(?:ランキング|上位|一覧|比較)/.test(userText)) {
    if (/(?:都道府県|地域別|県別|全国)/.test(title)) {
      score += 30;
    }
  }

  if (/(?:最新|直近|最近|現在)/.test(userText) && surveyYear > 0) {
    score += Math.max(0, 30 - Math.max(0, currentYear - surveyYear) * 4);
  }

  if (surveyYear > 0 && currentYear - surveyYear >= 10) {
    score -= 20;
  }

  if (/(?:速報|月報|年報|確報)/.test(title)) {
    score += 10;
  }

  if (/人口/.test(userText) && /CPI|消費者物価指数/i.test(title)) {
    score -= 40;
  }

  if (/(?:\bCPI\b|消費者物価指数)/i.test(userText) && /人口/.test(title)) {
    score -= 40;
  }

  return score;
}

function selectBestEstatSearchResult(searchResults: EstatSearchResultItem[], userText: string): EstatSearchResultItem {
  const ranked = [...searchResults].sort((left, right) => {
    const scoreDiff = scoreEstatSearchResult(right, userText) - scoreEstatSearchResult(left, userText);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return extractSurveyYear(right.survey_date) - extractSurveyYear(left.survey_date);
  });

  return ranked[0] || searchResults[0];
}

function buildEstatAutomationOutput(input: {
  selectedTable: EstatSearchResultItem;
  meta?: EstatMetaResponse;
  data?: Array<{ areaCode?: string; areaName?: string; timeCode?: string; timeName?: string; value?: string | number; tableCode?: string }>;
  note?: string;
}): string {
  return JSON.stringify(input, null, 2);
}

function resolveEstatItemName(items: EstatMetaItem[] | undefined, code: string | undefined): string | undefined {
  if (!Array.isArray(items) || !code) {
    return undefined;
  }

  return items.find((item) => item.code === code)?.name;
}

async function runEstatAutomation(
  client: Client,
  userText: string,
  searchOutput: string,
): Promise<{ toolName: string; output: string } | null> {
  const searchResults = parseJsonSafe<EstatSearchResultItem[]>(searchOutput);
  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    return null;
  }

  const selectedTable = selectBestEstatSearchResult(searchResults, userText);
  const statsId = typeof selectedTable.id === 'string' ? selectedTable.id : '';
  if (!statsId) {
    return null;
  }

  const intent = inferEstatIntent(userText);
  if (intent === 'search') {
    return null;
  }

  const metaResult = await client.callTool({
    name: 'get_statistic_meta',
    arguments: { stats_id: statsId },
  });
  const metaOutput = extractTextContent(metaResult);
  const metaError = extractToolError(metaResult, metaOutput);
  if (metaError) {
    return null;
  }

  const meta = parseJsonSafe<EstatMetaResponse>(metaOutput);
  if (!meta) {
    return null;
  }

  if (intent === 'meta') {
    return {
      toolName: 'get_statistic_meta',
      output: buildEstatAutomationOutput({
        selectedTable,
        meta,
        note: 'search_statistics の上位結果から get_statistic_meta を自動実行しました。',
      }),
    };
  }

  const areaCodes = pickEstatAreaCodes(meta, userText);
  const timeCode = pickEstatTimeCode(meta, userText);
  const tableCode = pickEstatTableCode(meta, userText);
  const wantsComparison = areaCodes.length > 1;

  const callArgsBase: Record<string, unknown> = {
    stats_id: statsId,
    limit: wantsComparison || /一覧|ランキング|上位|都道府県別/.test(userText) ? 50 : 20,
  };

  if (timeCode) {
    callArgsBase.cd_time = timeCode;
  }

  if (tableCode) {
    callArgsBase.cd_tab = tableCode;
  }

  const requests = areaCodes.length > 0
    ? areaCodes.map((code) => ({ ...callArgsBase, cd_area: code }))
    : [callArgsBase];

  const aggregatedValues: Array<{ areaCode?: string; areaName?: string; timeCode?: string; timeName?: string; value?: string | number; tableCode?: string }> = [];

  for (const requestArgs of requests) {
    const dataResult = await client.callTool({
      name: 'get_statistic_data',
      arguments: requestArgs,
    });
    const dataOutput = extractTextContent(dataResult);
    const dataError = extractToolError(dataResult, dataOutput);
    if (dataError) {
      continue;
    }

    const data = parseJsonSafe<EstatDataResponse>(dataOutput);
    if (!data || !Array.isArray(data.values)) {
      continue;
    }

    for (const value of data.values.slice(0, wantsComparison ? 10 : 20)) {
      aggregatedValues.push({
        value: value.value,
        tableCode: typeof value.table_code === 'string' ? value.table_code : undefined,
        areaCode: typeof value.area_code === 'string' ? value.area_code : undefined,
        areaName: resolveEstatItemName(meta.area_items, typeof value.area_code === 'string' ? value.area_code : undefined),
        timeCode: typeof value.time_code === 'string' ? value.time_code : undefined,
        timeName: resolveEstatItemName(meta.time_items, typeof value.time_code === 'string' ? value.time_code : undefined),
      });
    }
  }

  if (aggregatedValues.length === 0) {
    return {
      toolName: 'get_statistic_meta',
      output: buildEstatAutomationOutput({
        selectedTable,
        meta,
        note: 'search_statistics の上位結果に対して get_statistic_data を試みましたが、自然言語から絞り込み条件を十分に特定できなかったため、表構造を返します。',
      }),
    };
  }

  return {
    toolName: 'get_statistic_data',
    output: buildEstatAutomationOutput({
      selectedTable,
      meta,
      data: aggregatedValues,
      note: 'search_statistics の上位結果から get_statistic_meta / get_statistic_data を自動実行しました。',
    }),
  };
}

function pickWeatherCity(userText: string): string {
  if (/(tokyo|東京)/i.test(userText)) return '東京';
  if (/(osaka|大阪)/i.test(userText)) return '大阪';
  if (/(sapporo|札幌)/i.test(userText)) return '札幌';
  if (/(fukuoka|福岡)/i.test(userText)) return '福岡';
  return '東京';
}

function extractExpression(userText: string): string | null {
  const normalized = userText
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xfee0))
    .replace(/×/g, '*')
    .replace(/÷/g, '/');

  const match = normalized.match(/(-?\d+(?:\.\d+)?(?:\s*[-+*/()]\s*-?\d+(?:\.\d+)?)+)/);
  return match?.[1]?.trim() || null;
}

function extractGoogleEmailFromText(userText: string): string | null {
  const emailMatch = userText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return emailMatch?.[0] || null;
}

function extractUserEmail(userText: string): string | null {
  const match = userText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.trim() || null;
}

function extractDatabaseSearchQuery(userText: string): string {
  const tablePattern = /([A-Za-z0-9_]+)\s*(?:テーブル|table)\s*(?:の)?\s*(?:カラム|列|項目|構成|schema|schemas?|columns?|fields?)/i;
  const patternMatch = userText.match(tablePattern);
  if (patternMatch?.[1]?.trim()) {
    return patternMatch[1].trim();
  }

  return extractSearchQuery(userText);
}

function inferDbHubObjectType(userText: string): 'schema' | 'table' | 'column' | 'procedure' | 'function' | 'index' {
  if (/(?:カラム|列|項目|schema|schemas?|columns?|fields?)/i.test(userText)) {
    return 'column';
  }

  if (/(?:index|indexes|インデックス)/i.test(userText)) {
    return 'index';
  }

  if (/(?:function|functions|関数)/i.test(userText)) {
    return 'function';
  }

  if (/(?:procedure|procedures|プロシージャ)/i.test(userText)) {
    return 'procedure';
  }

  if (/(?:schema|schemas|スキーマ)/i.test(userText)) {
    return 'schema';
  }

  return 'table';
}

function isDbHubSimpleTotalCountQuery(userText: string): boolean {
  if (!/(?:何件|件数|総数|全部で|全件|count\s*\(|count\b)/i.test(userText)) {
    return false;
  }

  if (/(?:ユニーク|distinct|種類|種別|ごと|ごとの|ごとに|内訳|件数付き|一覧|列挙|group\s+by|グループ|集計|平均|最大|最小|重複)/i.test(userText)) {
    return false;
  }

  if (/(?:カラム|列|項目).*(?:何件|件数)|(?:何件|件数).*(?:カラム|列|項目)/i.test(userText)) {
    return false;
  }

  if (/(?:where\b|かつ|and\b|or\b|条件|一致|含む|以上|以下|未満|超|between\b| in\b|[=><]|が.+の.+(?:何件|件数)|(?:何件|件数).+が.+の)/i.test(userText)) {
    return false;
  }

  return true;
}

function isDbHubAggregateQuery(userText: string): boolean {
  return /(?:ユニーク|distinct|種類|種別|ごと|ごとの|ごとに|内訳|件数付き|group\s+by|グループ|集計|平均|最大|最小|重複)/i.test(userText);
}

function parseDbHubExplorationTableNames(explorationSummary?: string): string[] {
  if (!explorationSummary) {
    return [];
  }

  const tablesLine = explorationSummary
    .split(/\r?\n/)
    .find((line) => line.startsWith('tables: '));

  if (!tablesLine) {
    return [];
  }

  return tablesLine
    .slice('tables: '.length)
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name !== 'none');
}

function scoreDbHubTableCandidate(tableName: string, userText: string): number {
  const normalizedTable = tableName.trim().toLowerCase();
  const normalizedText = userText.trim().toLowerCase();
  const compactTable = normalizedTable.replace(/[_\s-]/g, '');
  const compactText = normalizedText.replace(/[\s_-]/g, '');
  let score = 0;

  if (normalizedText.includes(normalizedTable) || compactText.includes(compactTable)) {
    score += 100;
  }

  const aliasMatchers: Array<{ pattern: RegExp; aliases: RegExp }> = [
    { pattern: /物件/i, aliases: /property|properties|estate|listing|room|rooms|building|buildings|apartment/i },
    { pattern: /顧客/i, aliases: /customer|customers|client|clients|user|users|member|members|contact|contacts/i },
    { pattern: /契約/i, aliases: /contract|contracts|agreement|agreements|deal|deals|order|orders/i },
    { pattern: /売上/i, aliases: /sale|sales|revenue|revenues|payment|payments|invoice|invoices/i },
  ];

  for (const matcher of aliasMatchers) {
    if (matcher.pattern.test(userText) && matcher.aliases.test(normalizedTable)) {
      score += 60;
    }
  }

  if (isDbHubSimpleTotalCountQuery(userText) && /(?:_?master|_?mst|_?list)$/i.test(normalizedTable)) {
    score -= 10;
  }

  return score;
}

function formatDbHubSqlIdentifier(identifier: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    return identifier;
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    return identifier;
  }

  return identifier
    .split('.')
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join('.');
}

function buildDbHubCountSql(userText: string, explorationSummary?: string): string | null {
  if (!isDbHubSimpleTotalCountQuery(userText)) {
    return null;
  }

  const tableNames = parseDbHubExplorationTableNames(explorationSummary);
  if (tableNames.length === 0) {
    return null;
  }

  const ranked = tableNames
    .map((tableName) => ({ tableName, score: scoreDbHubTableCandidate(tableName, userText) }))
    .sort((left, right) => right.score - left.score);

  const selectedTable = ranked[0];
  if (!selectedTable || (selectedTable.score <= 0 && tableNames.length > 1)) {
    return null;
  }

  return `SELECT COUNT(*) AS total_count FROM ${formatDbHubSqlIdentifier(selectedTable.tableName)};`;
}

function normalizeDbHubToolArguments(toolName: string, args: Record<string, unknown>, userText: string): Record<string, unknown> {
  if (toolName === 'search_objects') {
    const query = typeof args.query === 'string' && args.query.trim()
      ? args.query.trim()
      : typeof args.table === 'string' && args.table.trim()
        ? args.table.trim()
        : typeof args.table_name === 'string' && args.table_name.trim()
          ? args.table_name.trim()
          : extractDatabaseSearchQuery(userText);

      const objectType = typeof args.object_type === 'string' && args.object_type.trim()
        ? args.object_type.trim()
        : inferDbHubObjectType(userText);

    return {
      query,
        object_type: objectType,
      source: 'default',
    };
  }

  if (toolName === 'execute_sql') {
    const sql = typeof args.sql === 'string' && args.sql.trim()
      ? args.sql.trim()
      : typeof args.query === 'string' && args.query.trim()
        ? args.query.trim()
        : '';

    if (!sql) {
      return {
        ...args,
        source: 'default',
      };
    }

    return {
      sql,
      source: 'default',
    };
  }

  return args;
}

function createDbHubFallbackDecision(userText: string, availableTools: string[]): ToolDecision | null {
  if (isDbHubSimpleTotalCountQuery(userText) && availableTools.includes('execute_sql')) {
    return {
      name: 'execute_sql',
      args: normalizeToolArguments('execute_sql', {}, userText),
    };
  }

  if (isDbHubAggregateQuery(userText) && availableTools.includes('execute_sql')) {
    return {
      name: 'execute_sql',
      args: normalizeToolArguments('execute_sql', {}, userText),
    };
  }

  if (/(?:テーブル|table|カラム|列|項目|構成|schema|schemas?|column|columns|field|fields|インデックス|index|一覧|検索|探して|調べて|見せて|最新|登録|更新|物件|顧客|契約|売上)/i.test(userText)
    && availableTools.includes('search_objects')) {
    return {
      name: 'search_objects',
      args: normalizeToolArguments('search_objects', {}, userText),
    };
  }

  if (/(?:select|insert|update|delete|from|where|join|group by|order by|sql)/i.test(userText)
    && availableTools.includes('execute_sql')) {
    return {
      name: 'execute_sql',
      args: normalizeToolArguments('execute_sql', {}, userText),
    };
  }

  return null;
}

function createFallbackDecision(userText: string, availableTools: string[]): ToolDecision | null {
  if (/(検索|調べて|search|lookup|find)/i.test(userText)) {
    return resolveExecutableTool('search_web', { query: extractSearchQuery(userText) }, availableTools, userText)
      || resolveExecutableTool('fetch_url', { query: extractSearchQuery(userText) }, availableTools, userText);
  }

  if (/(天気|weather)/i.test(userText)) {
    return resolveExecutableTool('get_mock_weather', { city: pickWeatherCity(userText) }, availableTools, userText);
  }

  if (/(計算|calculate|calc|式)/i.test(userText)) {
    return resolveExecutableTool('calculate', { expression: extractExpression(userText) || '0 + 0' }, availableTools, userText);
  }

  if (/(ツール一覧|使えるツール|list tools|tools list)/i.test(userText)) {
    return resolveExecutableTool('list_tools_info', {}, availableTools, userText);
  }

  if (/(echo|オウム返し)/i.test(userText)) {
    return resolveExecutableTool('echo', { message: userText.slice(0, 200) }, availableTools, userText);
  }

  if (/(時刻|時間|何時|current time|time now)/i.test(userText)) {
    return resolveExecutableTool('get_current_time', {}, availableTools, userText);
  }

  return resolveExecutableTool(MCP_DEFAULT_TOOL, {}, availableTools, userText)
    || resolveExecutableTool('search_web', { query: extractSearchQuery(userText) }, availableTools, userText)
    || resolveExecutableTool('fetch_url', { query: extractSearchQuery(userText) }, availableTools, userText);
}

function normalizeToolArguments(toolName: string, args: Record<string, unknown>, userText: string): Record<string, unknown> {
  if (toolName === 'crawl_site') {
    const directUrl = typeof args.url === 'string' && args.url.trim() ? args.url.trim() : '';
    const urlFromText = extractUrlFromText(userText);
    const url = directUrl || urlFromText || '';
    if (!url) {
      return args;
    }
    const maxPages = typeof args.max_pages === 'number' ? args.max_pages : 10;
    return { url, max_pages: maxPages };
  }

  if (toolName === 'fetch_url') {
    const directUrl = typeof args.url === 'string' && args.url.trim() ? args.url.trim() : '';
    const query = typeof args.query === 'string' && args.query.trim()
      ? extractSearchQuery(args.query)
      : typeof args.q === 'string' && args.q.trim()
        ? extractSearchQuery(args.q)
        : typeof args.keyword === 'string' && args.keyword.trim()
          ? extractSearchQuery(args.keyword)
          : '';

    const urlFromText = extractUrlFromText(userText);
    const url = directUrl || urlFromText || buildWebSearchUrl(query || extractSearchQuery(userText));

    const maxLength = typeof args.max_length === 'number'
      ? args.max_length
      : typeof args.maxLength === 'number'
        ? args.maxLength
        : undefined;

    return typeof maxLength === 'number' ? { url, max_length: maxLength } : { url };
  }

  if (toolName === 'search_web' || toolName === 'web_search' || toolName === 'search') {
    const query = typeof args.query === 'string' && args.query.trim()
      ? extractSearchQuery(args.query)
      : typeof args.q === 'string' && args.q.trim()
        ? extractSearchQuery(args.q)
        : typeof args.keyword === 'string' && args.keyword.trim()
          ? extractSearchQuery(args.keyword)
          : extractSearchQuery(userText);
    return { query };
  }

  if (toolName === 'search_statistics') {
    const keyword = normalizeEstatSearchKeyword(userText, args);

    const limit = typeof args.limit === 'number'
      ? args.limit
      : typeof args.max_results === 'number'
        ? args.max_results
        : typeof args.maxResults === 'number'
          ? args.maxResults
          : 20;

    return { keyword, limit };
  }

  if (toolName === 'get_mock_weather') {
    const city = typeof args.city === 'string' && args.city.trim() ? args.city.trim() : pickWeatherCity(userText);
    return { city };
  }

  if (toolName === 'calculate') {
    const expression = typeof args.expression === 'string' && args.expression.trim()
      ? args.expression.trim()
      : extractExpression(userText) || '0 + 0';
    return { expression };
  }

  if (toolName === 'echo') {
    const message = typeof args.message === 'string' && args.message.trim()
      ? args.message
      : userText.slice(0, 200);
    return { message };
  }

  if (toolName === 'search_objects' || toolName === 'execute_sql') {
    return normalizeDbHubToolArguments(toolName, args, userText);
  }

  if (toolName === 'search_gmail_messages') {
    const userGoogleEmail = typeof args.user_google_email === 'string' && args.user_google_email.trim()
      ? args.user_google_email.trim()
      : extractGoogleEmailFromText(userText) || 'default';
    const query = typeof args.query === 'string' && args.query.trim()
      ? args.query.trim()
      : 'newer_than:7d';
    const maxResults = typeof args.max_results === 'number'
      ? args.max_results
      : typeof args.maxResults === 'number'
        ? args.maxResults
        : typeof args.page_size === 'number'
          ? args.page_size
        : 5;
    const pageToken = typeof args.page_token === 'string' && args.page_token.trim()
      ? args.page_token.trim()
      : typeof args.pageToken === 'string' && args.pageToken.trim()
        ? args.pageToken.trim()
        : undefined;
    return pageToken
      ? { user_google_email: userGoogleEmail, query, page_size: maxResults, page_token: pageToken }
      : { user_google_email: userGoogleEmail, query, page_size: maxResults };
  }

  if (toolName === 'search_drive_files') {
    const userGoogleEmail = typeof args.user_google_email === 'string' && args.user_google_email.trim()
      ? args.user_google_email.trim()
      : extractGoogleEmailFromText(userText) || 'default';
    const query = typeof args.query === 'string' && args.query.trim()
      ? args.query.trim()
      : extractSearchQuery(userText);
    return { user_google_email: userGoogleEmail, query };
  }

  // Google Workspace tools often require user_google_email in their schema.
  // In single-user mode, 'default' allows server-side session resolution.
  if (/gmail|drive|calendar|sheets|docs|slides|forms|tasks|contacts|script/i.test(toolName)) {
    const userGoogleEmail = typeof args.user_google_email === 'string' && args.user_google_email.trim()
      ? args.user_google_email.trim()
      : extractGoogleEmailFromText(userText) || 'default';
    return { ...args, user_google_email: userGoogleEmail };
  }

  return args;
}

function toToolNameList(listToolsResult: unknown): string[] {
  const result = listToolsResult as { tools?: Array<{ name?: unknown }> };
  if (!Array.isArray(result?.tools)) {
    return [];
  }

  return result.tools
    .map((tool) => (typeof tool?.name === 'string' ? tool.name.trim() : ''))
    .filter((name) => name.length > 0);
}

function resolveExecutableTool(
  requestedTool: string,
  requestedArgs: Record<string, unknown>,
  availableTools: string[],
  userText: string,
): ToolDecision | null {
  if (availableTools.includes(requestedTool)) {
    return {
      name: requestedTool,
      args: normalizeToolArguments(requestedTool, requestedArgs, userText),
    };
  }

  if (SEARCH_TOOL_ALIASES.includes(requestedTool as (typeof SEARCH_TOOL_ALIASES)[number])) {
    const resolvedAlias = SEARCH_TOOL_ALIASES.find((name) => availableTools.includes(name));
    if (resolvedAlias) {
      return {
        name: resolvedAlias,
        args: normalizeToolArguments(resolvedAlias, requestedArgs, userText),
      };
    }

    if (availableTools.includes('fetch_url')) {
      const normalizedSearchArgs = normalizeToolArguments('search_web', requestedArgs, userText);
      const query = typeof normalizedSearchArgs.query === 'string'
        ? normalizedSearchArgs.query
        : extractSearchQuery(userText);

      return {
        name: 'fetch_url',
        args: {
          url: buildWebSearchUrl(query),
          max_length: 6000,
        },
      };
    }
  }

  return null;
}

function resolveTemplateValue(value: unknown, userText: string): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (value === '{{userText}}') {
    return userText;
  }

  if (value === '{{city}}') {
    return pickWeatherCity(userText);
  }

  if (value === '{{expression}}') {
    return extractExpression(userText) || '0 + 0';
  }

  if (value === '{{query}}') {
    return extractSearchQuery(userText);
  }

  if (value === '{{email}}' || value === '{{user_google_email}}') {
    return extractUserEmail(userText) || '';
  }

  return value;
}

function buildRuleArgs(rule: MCPRuleRoutingRule, userText: string): Record<string, unknown> {
  const template = rule.argsTemplate && typeof rule.argsTemplate === 'object'
    ? rule.argsTemplate
    : {};

  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    args[key] = resolveTemplateValue(value, userText);
  }

  return normalizeToolArguments(rule.toolName, args, userText);
}

function resolveRuleDecision(server: MCPServer, userText: string): ToolDecision | null {
  const ruleRouting = server.ruleRouting;
  if (!ruleRouting?.enabled || !Array.isArray(ruleRouting.rules) || ruleRouting.rules.length === 0) {
    return null;
  }

  if (server.id === 'dbhub' && isDbHubSimpleTotalCountQuery(userText)) {
    const countRule = ruleRouting.rules.find((rule) => rule.enabled && rule.toolName === 'execute_sql');
    if (countRule) {
      return {
        name: countRule.toolName,
        args: buildRuleArgs(countRule, userText),
      };
    }
  }

  const sortedRules = [...ruleRouting.rules]
    .filter((rule) => rule.enabled && Array.isArray(rule.keywords) && rule.keywords.length > 0 && !!rule.toolName)
    .sort((a, b) => b.priority - a.priority);

  const normalizedText = userText.toLowerCase();
  for (const rule of sortedRules) {
    const matched = rule.keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase()));
    if (matched) {
      return {
        name: rule.toolName,
        args: buildRuleArgs(rule, userText),
      };
    }
  }

  return null;
}

function parseRouterJson(content: string): {
  tool?: string;
  arguments?: Record<string, unknown>;
  confidence?: number;
} | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    return {
      tool: typeof obj.tool === 'string' ? obj.tool : undefined,
      arguments: obj.arguments && typeof obj.arguments === 'object' && !Array.isArray(obj.arguments)
        ? (obj.arguments as Record<string, unknown>)
        : {},
      confidence: typeof obj.confidence === 'number' ? obj.confidence : undefined,
    };
  } catch {
    return null;
  }
}

function parseDbHubSearchOutput(output: string): {
  success?: boolean;
  data?: {
    object_type?: string;
    results?: Array<Record<string, unknown>>;
  };
} | null {
  try {
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as {
      success?: boolean;
      data?: {
        object_type?: string;
        results?: Array<Record<string, unknown>>;
      };
    };
  } catch {
    return null;
  }
}

function buildDbHubExplorationSummary(tableOutput: string, columnOutput: string): string {
  const tablePayload = parseDbHubSearchOutput(tableOutput);
  const columnPayload = parseDbHubSearchOutput(columnOutput);

  const tableNames = Array.isArray(tablePayload?.data?.results)
    ? tablePayload.data.results
        .map((item) => (typeof item.name === 'string' ? item.name.trim() : ''))
        .filter((name) => name.length > 0)
    : [];

  const columnsByTable = new Map<string, string[]>();
  if (Array.isArray(columnPayload?.data?.results)) {
    for (const item of columnPayload.data.results) {
      const table = typeof item.table === 'string' ? item.table.trim() : '';
      const column = typeof item.name === 'string' ? item.name.trim() : '';
      if (!table || !column) {
        continue;
      }
      const existing = columnsByTable.get(table) || [];
      if (!existing.includes(column)) {
        existing.push(column);
      }
      columnsByTable.set(table, existing);
    }
  }

  const lines: string[] = [];
  lines.push('DB metadata exploration result:');
  lines.push(`tables: ${tableNames.join(', ') || 'none'}`);
  for (const tableName of tableNames.slice(0, 20)) {
    const columns = columnsByTable.get(tableName) || [];
    lines.push(`table ${tableName}: columns=${columns.join(', ') || 'none'}`);
  }

  if (tableNames.length === 0 && columnsByTable.size === 0) {
    lines.push('No metadata found.');
  }

  return lines.join('\n');
}

function finalizeDbHubDecision(
  decision: ToolDecision,
  userText: string,
  explorationSummary?: string,
): ToolDecision {
  if (decision.name !== 'execute_sql') {
    return decision;
  }

  const sql = typeof decision.args.sql === 'string' ? decision.args.sql.trim() : '';
  if (sql) {
    return decision;
  }

  const synthesizedSql = buildDbHubCountSql(userText, explorationSummary);
  if (!synthesizedSql) {
    return decision;
  }

  return {
    name: decision.name,
    args: {
      ...decision.args,
      sql: synthesizedSql,
      source: 'default',
    },
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createAiRouterUserPrompt(
  userText: string,
  ai: MCPAIRoutingConfig,
  availableTools: string[],
  explorationSummary?: string,
): string {
  const hasAllowlist = Array.isArray(ai.allowedTools) && ai.allowedTools.length > 0;
  const effectiveTools = hasAllowlist
    ? ai.allowedTools.filter((tool) => availableTools.includes(tool))
    : availableTools;
  const lines = [
    `userText: ${userText}`,
    `availableTools: ${JSON.stringify(availableTools)}`,
    `allowedTools: ${JSON.stringify(ai.allowedTools)}`,
    `effectiveTools: ${JSON.stringify(effectiveTools)}`,
    '出力はJSONのみで返してください。',
    hasAllowlist
      ? 'toolは effectiveTools から選ぶか no_tool にしてください。'
      : 'toolは availableTools から実在するツール名を選ぶか no_tool を返してください。',
  ];

  if (explorationSummary) {
    lines.push('まず以下のDBメタ情報探索結果を使って、自然言語がどのテーブル・カラムに対応するか推定してください。');
    lines.push('テーブル名が明示されていない場合でも、業務語から最も近いテーブル・カラムを選んでください。');
    lines.push('構造確認・存在確認は search_objects を優先し、件数・一覧・集計・抽出は execute_sql を選んでください。');
    lines.push('曖昧でも no_tool を返す前に、この探索結果から最も近い候補を使って判断してください。');
    lines.push(explorationSummary);
  }

  return lines.join('\n');
}

async function callOllamaRouter(
  userText: string,
  ai: MCPAIRoutingConfig,
  timeoutMs: number,
  availableTools: string[],
  explorationSummary?: string,
): Promise<string> {
  const baseUrl = process.env.INJECTION_OLLAMA_URL || 'http://127.0.0.1:11434';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ai.model,
        stream: false,
        format: 'json',
        options: {
          temperature: ai.temperature,
          num_predict: ai.maxTokens,
        },
        messages: [
          { role: 'system', content: ai.systemPrompt },
          { role: 'user', content: createAiRouterUserPrompt(userText, ai, availableTools, explorationSummary) },
        ],
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`Ollama router error: HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama router returned empty content');
  }

  return content;
}

async function callOpenAiRouter(
  userText: string,
  ai: MCPAIRoutingConfig,
  timeoutMs: number,
  availableTools: string[],
  explorationSummary?: string,
): Promise<string> {
  const baseUrl = process.env.INJECTION_OPENAI_BASE_URL || 'https://api.openai.com';
  const apiKey = process.env.INJECTION_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('INJECTION_OPENAI_API_KEY is not set');
  }

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: ai.temperature,
        max_tokens: ai.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ai.systemPrompt },
          { role: 'user', content: createAiRouterUserPrompt(userText, ai, availableTools, explorationSummary) },
        ],
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`OpenAI router error: HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI router returned empty content');
  }

  return content;
}

async function resolveAIDecision(
  server: MCPServer,
  userText: string,
  availableTools: string[],
  explorationSummary?: string,
): Promise<ToolDecision | null> {
  const ai = server.aiRouting;
  if (!ai?.enabled) {
    return null;
  }

  const timeoutMs = Math.max(1000, Math.min(server.timeout, MCP_ROUTER_TIMEOUT_MS));
  const hasAllowlist = Array.isArray(ai.allowedTools) && ai.allowedTools.length > 0;
  const effectiveTools = hasAllowlist
    ? ai.allowedTools.filter((tool) => availableTools.includes(tool))
    : availableTools;

  if (effectiveTools.length === 0) {
    return null;
  }

  const rawContent = ai.provider === 'openai'
    ? await callOpenAiRouter(userText, ai, timeoutMs, availableTools, explorationSummary)
    : await callOllamaRouter(userText, ai, timeoutMs, availableTools, explorationSummary);

  const parsed = parseRouterJson(rawContent);
  if (!parsed?.tool) {
    return null;
  }

  if (parsed.tool === 'no_tool') {
    return null;
  }

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 1;
  if (confidence < ai.confidenceThreshold) {
    if (ai.fallbackTool && effectiveTools.includes(ai.fallbackTool)) {
      return {
        name: ai.fallbackTool,
        args: normalizeToolArguments(ai.fallbackTool, {}, userText),
      };
    }
    return null;
  }

  if (!effectiveTools.includes(parsed.tool)) {
    return null;
  }

  const argumentsValue = parsed.arguments && typeof parsed.arguments === 'object'
    ? parsed.arguments
    : {};

  return {
    name: parsed.tool,
    args: normalizeToolArguments(parsed.tool, argumentsValue, userText),
  };
}
//MVO: ここにユーザーの入力テキストとサーバーの状態から、呼び出すツールと引数を決定するロジックを実装。ルールベース、AIベース、その他のヒューリスティクスなどを組み合わせて、最適なツール呼び出しを選択してください。
async function pickToolAndArgs(
  server: MCPServer,
  userText: string,
  availableTools: string[],
  explorationSummary?: string,
): Promise<ToolDecision | null> {
  const mode = server.mode || 'rule';

  const dbHubFallback = server.id === 'dbhub'
    ? createDbHubFallbackDecision(userText, availableTools)
    : null;

  if (mode === 'rule') {
    const byRule = resolveRuleDecision(server, userText);
    if (byRule) {
      return byRule;
    }

    if (server.aiRouting?.enabled) {
      return (await resolveAIDecision(server, userText, availableTools, explorationSummary))
        || dbHubFallback
        || (MCP_ALWAYS_ON ? createFallbackDecision(userText, availableTools) : null);
    }

    return dbHubFallback || (MCP_ALWAYS_ON ? createFallbackDecision(userText, availableTools) : null);
  }

  if (mode === 'ai') {
    return (await resolveAIDecision(server, userText, availableTools, explorationSummary)) || dbHubFallback || (MCP_ALWAYS_ON ? createFallbackDecision(userText, availableTools) : null);
  }

  const byRule = resolveRuleDecision(server, userText);
  if (byRule) {
    return byRule;
  }

  return (await resolveAIDecision(server, userText, availableTools, explorationSummary)) || dbHubFallback || (MCP_ALWAYS_ON ? createFallbackDecision(userText, availableTools) : null);
}

function extractTextContent(callResult: unknown): string {
  const resultObj = callResult as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
  };

  if (Array.isArray(resultObj?.content) && resultObj.content.length > 0) {
    const texts = resultObj.content
      .map((item) => (item?.type === 'text' || item?.text ? item.text : ''))
      .filter((text): text is string => typeof text === 'string' && text.trim().length > 0);

    if (texts.length > 0) {
      return texts.join('\n');
    }
  }

  if (typeof resultObj?.structuredContent !== 'undefined') {
    try {
      return JSON.stringify(resultObj.structuredContent, null, 2);
    } catch {
      return String(resultObj.structuredContent);
    }
  }

  return 'MCPツールは実行されましたが、テキスト結果は空でした。';
}

function extractToolError(callResult: unknown, output: string): string | null {
  const resultObj = callResult as {
    isError?: unknown;
  };

  if (resultObj?.isError === true) {
    return output || 'MCP tool returned an error';
  }

  if (/^Error executing tool:?/i.test(output.trim())) {
    return output.trim();
  }

  return null;
}

async function createTransport(server: MCPServer) {
  // Docker環境では localhost を内部サービス名に置換
  const internalBase = process.env.INJECTION_MCP_INTERNAL_BASE_URL;
  function resolveUrl(url: string): string {
    if (internalBase) {
      return url.replace(/^https?:\/\/localhost(:\d+)?/, internalBase);
    }
    return url;
  }

  if (server.transport === 'sse') {
    if (!server.config.url) {
      throw new Error('SSE URLが未設定です');
    }
    return new SSEClientTransport(new URL(resolveUrl(server.config.url)));
  }

  if (server.transport === 'http') {
    if (!server.config.url) {
      throw new Error('HTTP URLが未設定です');
    }
    return new StreamableHTTPClientTransport(new URL(resolveUrl(server.config.url)));
  }

  throw new Error('stdioトランスポートはPhase 2対象外です');
}

function shouldEnforceGoogleReadonly(input: { attachedPackIds?: string[] }): boolean {
  return Array.isArray(input.attachedPackIds)
    && input.attachedPackIds.some((pack) => (pack || '').trim().toLowerCase() === GOOGLE_WORKSPACE_PACK_ID);
}

function isAllowedGoogleReadonlyTool(toolName: string): boolean {
  if (GOOGLE_READONLY_TOOL_ALLOWLIST.length === 0) {
    return true;
  }
  return GOOGLE_READONLY_TOOL_ALLOWLIST.includes(toolName);
}
//MVO: ここにサーバーへのツール呼び出しロジックを実装。ルーティング、ツール選択、呼び出し、エラーハンドリングなどを含む。
async function callServerTool(
  server: MCPServer,
  userText: string,
  context: {
    requestId: string;
    sessionId?: string;
    userId?: string;
    attachedPackIds?: string[];
  },
  forcedDecision?: ToolDecision,
): Promise<MCPExecutionResult> {
  const transport = await createTransport(server);
  const client = new Client({
    name: 'injection-tool',
    version: '1.0.0',
  });
  let selectedToolName: string | undefined;

  try {
    await client.connect(transport);

    const listToolsResult = await client.listTools();
    const availableTools = toToolNameList(listToolsResult);

    let explorationContext: DBHubExplorationContext | undefined;
    if (server.id === 'dbhub' && availableTools.includes('search_objects')) {
      const tableMetadataResult = await client.callTool({
        name: 'search_objects',
        arguments: { query: '', object_type: 'table', source: 'default' },
      });
      const columnMetadataResult = await client.callTool({
        name: 'search_objects',
        arguments: { query: '', object_type: 'column', source: 'default' },
      });

      explorationContext = {
        summary: buildDbHubExplorationSummary(
          extractTextContent(tableMetadataResult),
          extractTextContent(columnMetadataResult),
        ),
      };
    }

    const decision = forcedDecision || await pickToolAndArgs(server, userText, availableTools, explorationContext?.summary);
    if (!decision) {
      const noMatchResult: MCPExecutionResult = {
        success: false,
        serverId: server.id,
        serverName: server.name,
        error: 'ツール選択条件に一致しませんでした',
        errorCode: 'TOOL_SELECTION_NO_MATCH',
      };
      writeMCPAuditLog({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userId: context.userId,
        attachedPackIds: context.attachedPackIds,
        toolName: 'no_tool',
        success: false,
        errorCode: noMatchResult.errorCode,
      });
      return noMatchResult;
    }

    const { name, args } = decision;
    selectedToolName = name;
    let executable = resolveExecutableTool(name, args, availableTools, userText);

    if (executable && server.id === 'dbhub') {
      executable = finalizeDbHubDecision(executable, userText, explorationContext?.summary);
    }

    if (!executable) {
      const notImplementedResult: MCPExecutionResult = {
        success: false,
        serverId: server.id,
        serverName: server.name,
        toolName: selectedToolName,
        error: `要求ツール '${name}' はサーバー未実装です（available: ${availableTools.join(', ') || 'none'}）`,
        errorCode: 'TOOL_NOT_IMPLEMENTED',
      };
      writeMCPAuditLog({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userId: context.userId,
        attachedPackIds: context.attachedPackIds,
        toolName: selectedToolName || 'unknown-tool',
        success: false,
        errorCode: notImplementedResult.errorCode,
      });
      return notImplementedResult;
    }

    selectedToolName = executable.name;

    if (shouldEnforceGoogleReadonly(context) && !isAllowedGoogleReadonlyTool(selectedToolName)) {
      const disallowedResult: MCPExecutionResult = {
        success: false,
        serverId: server.id,
        serverName: server.name,
        toolName: selectedToolName,
        error: `ツール '${selectedToolName}' はread-only allowlist外のため拒否されました`,
        errorCode: 'TOOL_NOT_ALLOWED',
      };
      writeMCPAuditLog({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userId: context.userId,
        attachedPackIds: context.attachedPackIds,
        toolName: selectedToolName,
        success: false,
        errorCode: disallowedResult.errorCode,
      });
      return disallowedResult;
    }

    const callResult = await client.callTool({
      name: executable.name,
      arguments: executable.args,
    });

    let output = extractTextContent(callResult);
    const toolError = extractToolError(callResult, output);
    if (toolError) {
      const failedResult: MCPExecutionResult = {
        success: false,
        serverId: server.id,
        serverName: server.name,
        toolName: executable.name,
        error: toolError,
        errorCode: 'MCP_CALL_ERROR',
      };
      writeMCPAuditLog({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userId: context.userId,
        attachedPackIds: context.attachedPackIds,
        toolName: executable.name,
        success: false,
        errorCode: failedResult.errorCode,
      });
      return failedResult;
    }

    if (server.id === 'estat' && executable.name === 'search_statistics') {
      const automated = await runEstatAutomation(client, userText, output);
      if (automated) {
        selectedToolName = automated.toolName;
        output = automated.output;
      }
    }

    writeMCPAuditLog({
      requestId: context.requestId,
      sessionId: context.sessionId,
      userId: context.userId,
      attachedPackIds: context.attachedPackIds,
      toolName: selectedToolName || executable.name,
      success: true,
      errorCode: 'NONE',
      output,
    });

    return {
      success: true,
      serverId: server.id,
      serverName: server.name,
      toolName: selectedToolName || executable.name,
      output,
      errorCode: 'NONE',
    };
  } catch (err) {
    const errorResult: MCPExecutionResult = {
      success: false,
      serverId: server.id,
      serverName: server.name,
      toolName: selectedToolName,
      error: err instanceof Error ? err.message : 'Unknown MCP error',
      errorCode: 'MCP_CALL_ERROR',
    };
    writeMCPAuditLog({
      requestId: context.requestId,
      sessionId: context.sessionId,
      userId: context.userId,
      attachedPackIds: context.attachedPackIds,
      toolName: selectedToolName || 'unknown-tool',
      success: false,
      errorCode: errorResult.errorCode,
    });
    return errorResult;
  } finally {
    await transport.close().catch(() => undefined);
  }
}
//ドメインごとのMCP実行ロジック。複数サーバーが指定された場合は順番に試す。全て失敗したら最後のエラーを返す。
export async function executeMCPForDomain(input: {
  mcpServerIds?: string[];
  userText: string;
  requestId: string;
  sessionId?: string;
  userId?: string;
  attachedPackIds?: string[];
}): Promise<MCPExecutionResult | null> {
  const { mcpServerIds, userText } = input;

  if (!Array.isArray(mcpServerIds) || mcpServerIds.length === 0) {
    return null;
  }

  for (const id of mcpServerIds) {
    const server = getMCPServerById(id);

    if (!server || !server.enabled) {
      continue;
    }

    const mode = server.mode || 'rule';
    const requiresDecision = mode === 'rule' && !server.aiRouting?.enabled;
    if (requiresDecision && !shouldAttemptRuleRouting(server, userText)) {
      continue;
    }

    const result = await callServerTool(server, userText, {
      requestId: input.requestId,
      sessionId: input.sessionId,
      userId: input.userId,
      attachedPackIds: input.attachedPackIds,
    });

    if (!result.success && result.error === 'ツール選択条件に一致しませんでした' && server.id === 'dbhub') {
      const forcedDecision = createDbHubFallbackDecision(userText, ['search_objects', 'execute_sql']);
      if (forcedDecision) {
        const forcedResult = await callServerTool(server, userText, {
          requestId: input.requestId,
          sessionId: input.sessionId,
          userId: input.userId,
          attachedPackIds: input.attachedPackIds,
        }, forcedDecision);

        setMCPServerRuntimeStatus(server.id, {
          success: forcedResult.success,
          toolName: forcedResult.toolName,
          error: forcedResult.error,
        });

        if (forcedResult.success) {
          return forcedResult;
        }
      }
    }

    if (!result.success && result.error === 'ツール選択条件に一致しませんでした') {
      continue;
    }

    setMCPServerRuntimeStatus(server.id, {
      success: result.success,
      toolName: result.toolName,
      error: result.error,
    });

    if (result.success) {
      return result;
    }
  }

  return {
    success: false,
    error: '有効なMCPサーバーでツール実行に失敗しました',
    errorCode: 'MCP_NO_ELIGIBLE_SERVER',
  };
}
