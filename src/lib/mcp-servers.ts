/**
 * MCPサーバー管理ロジック
 * - MCPServer: MCP(Model Context Protocol)サーバーの接続情報
 * - ドメインとMCPサーバーの関連付け
 */

import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { getAllDomains } from './domains';

export type MCPRoutingMode = 'rule' | 'ai' | 'hybrid';

export interface MCPRuleRoutingRule {
  id: string;
  enabled: boolean;
  priority: number;
  keywords: string[];
  toolName: string;
  argsTemplate?: Record<string, unknown>;
}

export interface MCPRuleRoutingConfig {
  enabled: boolean;
  rules: MCPRuleRoutingRule[];
}

export interface MCPAIRoutingConfig {
  enabled: boolean;
  provider: 'ollama' | 'openai';
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  confidenceThreshold: number;
  allowedTools: string[];
  fallbackTool?: string;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  isPreset?: boolean;
  transport: 'stdio' | 'sse' | 'http';
  // stdio: { command: string; args: string[] }
  // sse: { url: string }
  // http: { url: string }
  config: {
    command?: string;
    args?: string[];
    url?: string;
  };
  enabled: boolean;
  timeout: number; // ミリ秒
  mode?: MCPRoutingMode;
  ruleRouting?: MCPRuleRoutingConfig;
  aiRouting?: MCPAIRoutingConfig;
  lastRuntimeSuccess?: boolean;
  lastRuntimeAt?: string;
  lastRuntimeToolName?: string;
  lastRuntimeError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MCPServerValidationResult {
  valid: boolean;
  errors: string[];
}

interface MCPServerStore {
  servers: MCPServer[];
}

const MCP_SERVERS_CONFIG_PATH = process.env.INJECTION_MCP_SERVERS_CONFIG || './data/mcp-servers.json';
const DEFAULT_MCP_TIMEOUT = parseInt(process.env.INJECTION_DEFAULT_MCP_TIMEOUT || '30000', 10);
const DEFAULT_PRESET_MCP_SERVER_IDS = ['dbhub', 'google-workspace', 'estat', 'mcp'] as const;

const DEFAULT_PRESET_MCP_SERVER_ORDER = new Map<string, number>(
  DEFAULT_PRESET_MCP_SERVER_IDS.map((id, index) => [id, index])
);

export function isProtectedMCPServerId(id: string): boolean {
  return DEFAULT_PRESET_MCP_SERVER_IDS.includes(id as (typeof DEFAULT_PRESET_MCP_SERVER_IDS)[number]);
}

function sortMCPServers(servers: MCPServer[]): MCPServer[] {
  return [...servers].sort((left, right) => {
    const leftOrder = DEFAULT_PRESET_MCP_SERVER_ORDER.get(left.id);
    const rightOrder = DEFAULT_PRESET_MCP_SERVER_ORDER.get(right.id);

    if (typeof leftOrder === 'number' && typeof rightOrder === 'number') {
      return leftOrder - rightOrder;
    }

    if (typeof leftOrder === 'number') {
      return -1;
    }

    if (typeof rightOrder === 'number') {
      return 1;
    }

    return left.name.localeCompare(right.name, 'ja');
  });
}

function buildHealthProbeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.pathname = '/health';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function buildHealthProbeCandidates(serverId: string, rawUrl: string): string[] {
  const candidates: string[] = [];
  const push = (url: string) => {
    if (url && !candidates.includes(url)) {
      candidates.push(url);
    }
  };

  const primary = buildHealthProbeUrl(rawUrl);
  push(primary);

  try {
    const parsed = new URL(rawUrl);

    // Docker composeのcontainer_name表記(ark-...)が名前解決できない環境向け。
    if (parsed.hostname.startsWith('ark-')) {
      const alt = new URL(rawUrl);
      alt.hostname = parsed.hostname.replace(/^ark-/, '');
      push(buildHealthProbeUrl(alt.toString()));
    }

    // ローカルで next dev を動かしている場合のフォールバック。
    if (serverId === 'google-workspace') {
      const publicPort = process.env.GOOGLE_WORKSPACE_MCP_PORT || '8001';
      const localhost = new URL(rawUrl);
      localhost.hostname = 'localhost';
      localhost.port = publicPort;
      push(buildHealthProbeUrl(localhost.toString()));

      const hostDockerInternal = new URL(rawUrl);
      hostDockerInternal.hostname = 'host.docker.internal';
      hostDockerInternal.port = publicPort;
      push(buildHealthProbeUrl(hostDockerInternal.toString()));
    }
  } catch {
    // URL解析不可時は primary のみ使用
  }

  return candidates;
}

const DEFAULT_AI_ROUTING_PROMPT = [
  'あなたはMCPツールルーターです。',
  '必ずJSONのみで返してください。',
  '以下の形式に厳密に従ってください:',
  '{"tool":"<toolName|no_tool>","arguments":{},"confidence":0.0,"reason":"..."}',
  'toolは allowedTools に含まれる値か no_tool のみ許可します。',
  '確信が低い場合は no_tool を選んでください。',
].join('\n');

const DEFAULT_DB_ROUTING_PROMPT_LINES = [
  'あなたはDB用MCPツールルーターです。',
  '必ずJSONのみで返してください。',
  '以下の形式に厳密に従ってください:',
  '{"tool":"<toolName|no_tool>","arguments":{},"confidence":0.0,"reason":"..."}',
  'toolは allowedTools に含まれる値か no_tool のみ許可します。',
  '構造確認・存在確認は search_objects を優先し、件数・一覧・集計・抽出は execute_sql を優先してください。',
  'ユーザーがテーブル名を明示しない場合でも、業務語から最も近いテーブル・カラムを推定してください。',
  '複数候補がある場合は、最も自然な候補を1つ選び、reason に判断根拠を短く書いてください。',
  '曖昧でも metadata から候補が見つかる場合は no_tool を避け、適切な候補を選んでください。',
  '無関係または根拠が足りない場合のみ no_tool を返してください。',
].join('\n');

function resolveRuntimeUrl(url: string): string {
  const internalBase = process.env.INJECTION_MCP_INTERNAL_BASE_URL;
  if (internalBase) {
    return url.replace(/^https?:\/\/localhost(:\d+)?/, internalBase);
  }
  return url;
}

async function createClientTransport(server: MCPServer) {
  if (server.transport === 'sse') {
    if (!server.config.url) {
      throw new Error('SSE URLが未設定です');
    }
    return new SSEClientTransport(new URL(resolveRuntimeUrl(server.config.url)));
  }

  if (server.transport === 'http') {
    if (!server.config.url) {
      throw new Error('HTTP URLが未設定です');
    }
    return new StreamableHTTPClientTransport(new URL(resolveRuntimeUrl(server.config.url)));
  }

  throw new Error('stdioのSystem Prompt自動生成は未対応です');
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

  return '';
}

function parseDbHubSearchOutput(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    const match = output.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function getDbHubResults(payload: unknown): Array<{ name?: string; table?: string }> {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    return [];
  }

  const data = payload.data;
  if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) {
    return [];
  }

  return data.results as Array<{ name?: string; table?: string }>;
}

function buildDbHubExplorationSummary(tableOutput: string, columnOutput: string): string {
  const tablePayload = parseDbHubSearchOutput(tableOutput);
  const columnPayload = parseDbHubSearchOutput(columnOutput);
  const tableResults = getDbHubResults(tablePayload);
  const columnResults = getDbHubResults(columnPayload);

  const tableNames = tableResults.length > 0
    ? tableResults
        .map((item: { name?: string }) => (typeof item.name === 'string' ? item.name.trim() : ''))
        .filter((name: string) => name.length > 0)
    : [];

  const columnsByTable = new Map<string, string[]>();
  if (columnResults.length > 0) {
    for (const item of columnResults) {
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

function toToolNameList(listToolsResult: unknown): string[] {
  const resultObj = listToolsResult as { tools?: Array<{ name?: string }> };
  return Array.isArray(resultObj?.tools)
    ? resultObj.tools
        .map((tool) => (typeof tool?.name === 'string' ? tool.name.trim() : ''))
        .filter((name) => name.length > 0)
    : [];
}

function createGeneratedSystemPrompt(server: MCPServer, availableTools: string[], explorationSummary?: string): string {
  const lines: string[] = [];
  const isDbLike = availableTools.includes('search_objects') || availableTools.includes('execute_sql');

  lines.push(isDbLike ? DEFAULT_DB_ROUTING_PROMPT_LINES : DEFAULT_AI_ROUTING_PROMPT);
  lines.push('');
  lines.push(`対象MCPサーバー名: ${server.name}`);
  if (server.description.trim()) {
    lines.push(`サーバー概要: ${server.description.trim()}`);
  }
  lines.push(`利用可能ツール: ${availableTools.join(', ') || 'none'}`);

  if (availableTools.includes('search_objects')) {
    lines.push('search_objects を使えるため、テーブル名・カラム名・構造確認はまずこれで確認してください。');
  }

  if (availableTools.includes('execute_sql')) {
    lines.push('execute_sql を使えるため、件数・一覧・集計・絞り込みは SQL で取得してください。');
  }

  if (explorationSummary) {
    lines.push('');
    lines.push('以下のDBメタ情報を優先して参照し、自然言語から最も近いテーブルとカラムを選んでください。');
    lines.push(explorationSummary);
  }

  return lines.join('\n');
}

export async function generateMCPServerSystemPrompt(id: string): Promise<{
  systemPrompt: string;
  availableTools: string[];
  explorationSummary?: string;
}> {
  const server = getMCPServerById(id);

  if (!server) {
    throw new Error('MCPサーバーが見つかりません');
  }

  if (server.transport === 'stdio') {
    return {
      systemPrompt: createGeneratedSystemPrompt(server, [], undefined),
      availableTools: [],
    };
  }

  const transport = await createClientTransport(server);
  const client = new Client({
    name: 'injection-tool-admin',
    version: '1.0.0',
  });

  try {
    await client.connect(transport);

    const listToolsResult = await client.listTools();
    const availableTools = toToolNameList(listToolsResult);

    let explorationSummary: string | undefined;
    if (availableTools.includes('search_objects')) {
      const tableMetadataResult = await client.callTool({
        name: 'search_objects',
        arguments: { query: '', object_type: 'table', source: 'default' },
      });
      const columnMetadataResult = await client.callTool({
        name: 'search_objects',
        arguments: { query: '', object_type: 'column', source: 'default' },
      });

      explorationSummary = buildDbHubExplorationSummary(
        extractTextContent(tableMetadataResult),
        extractTextContent(columnMetadataResult),
      );
    }

    return {
      systemPrompt: createGeneratedSystemPrompt(server, availableTools, explorationSummary),
      availableTools,
      explorationSummary,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function sanitizeId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

function createDefaultRuleRouting(): MCPRuleRoutingConfig {
  return {
    enabled: true,
    rules: [
      {
        id: 'search_default',
        enabled: true,
        priority: 110,
        keywords: ['検索', '調べて', '探して', 'search', 'lookup', 'find'],
        toolName: 'search_web',
        argsTemplate: { query: '{{query}}' },
      },
      {
        id: 'time_default',
        enabled: true,
        priority: 100,
        keywords: ['時刻', '時間', '何時', 'current time', 'time now'],
        toolName: 'get_current_time',
      },
      {
        id: 'weather_default',
        enabled: true,
        priority: 90,
        keywords: ['天気', 'weather'],
        toolName: 'get_mock_weather',
        argsTemplate: { city: '{{city}}' },
      },
      {
        id: 'calc_default',
        enabled: true,
        priority: 80,
        keywords: ['計算', 'calculate', 'calc', '式'],
        toolName: 'calculate',
        argsTemplate: { expression: '{{expression}}' },
      },
    ],
  };
}

function createDefaultAIRouting(): MCPAIRoutingConfig {
  return {
    enabled: false,
    provider: 'ollama',
    model: process.env.INJECTION_MCP_ROUTER_MODEL || process.env.NEXT_PUBLIC_OLLAMA_MODEL || 'qwen2.5:7b',
    systemPrompt: DEFAULT_AI_ROUTING_PROMPT,
    temperature: 0.1,
    maxTokens: 240,
    confidenceThreshold: 0.55,
    allowedTools: ['search_web', 'web_search', 'search', 'get_current_time', 'get_mock_weather', 'calculate', 'list_tools_info', 'echo'],
    fallbackTool: 'get_current_time',
  };
}

function toNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function normalizeRuleRouting(input: unknown): MCPRuleRoutingConfig {
  const defaults = createDefaultRuleRouting();
  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const source = input as Record<string, unknown>;
  const rawRules = Array.isArray(source.rules) ? source.rules : defaults.rules;
  const rules = rawRules
    .map((entry, index): MCPRuleRoutingRule | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const item = entry as Record<string, unknown>;
      const keywords = Array.isArray(item.keywords)
        ? item.keywords.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
        : [];

      const toolName = typeof item.toolName === 'string' && item.toolName.trim()
        ? item.toolName.trim()
        : '';

      if (keywords.length === 0 || !toolName) {
        return null;
      }

      const normalized: MCPRuleRoutingRule = {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `rule_${index + 1}`,
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        priority: Math.floor(toNumberInRange(item.priority, 100 - index, 0, 9999)),
        keywords,
        toolName,
      };

      if (item.argsTemplate && typeof item.argsTemplate === 'object' && !Array.isArray(item.argsTemplate)) {
        normalized.argsTemplate = item.argsTemplate as Record<string, unknown>;
      }

      return normalized;
    })
    .filter((rule): rule is MCPRuleRoutingRule => Boolean(rule));

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.enabled,
    rules: rules.length > 0 ? rules : defaults.rules,
  };
}

function normalizeAIRouting(input: unknown): MCPAIRoutingConfig {
  const defaults = createDefaultAIRouting();
  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const source = input as Record<string, unknown>;
  const provider = source.provider === 'openai' ? 'openai' : 'ollama';

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.enabled,
    provider,
    model: typeof source.model === 'string' && source.model.trim() ? source.model.trim() : defaults.model,
    systemPrompt:
      typeof source.systemPrompt === 'string' && source.systemPrompt.trim()
        ? source.systemPrompt
        : defaults.systemPrompt,
    temperature: toNumberInRange(source.temperature, defaults.temperature, 0, 1),
    maxTokens: Math.floor(toNumberInRange(source.maxTokens, defaults.maxTokens, 32, 2000)),
    confidenceThreshold: toNumberInRange(source.confidenceThreshold, defaults.confidenceThreshold, 0, 1),
    allowedTools: Array.isArray(source.allowedTools)
      ? source.allowedTools.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
      : defaults.allowedTools,
    fallbackTool:
      typeof source.fallbackTool === 'string' && source.fallbackTool.trim()
        ? source.fallbackTool.trim()
        : defaults.fallbackTool,
  };
}

function normalizeRoutingMode(value: unknown, ai: MCPAIRoutingConfig): MCPRoutingMode {
  if (value === 'rule' || value === 'ai' || value === 'hybrid') {
    return value;
  }
  return ai.enabled ? 'hybrid' : 'rule';
}

function normalizeMCPServer(server: MCPServer): MCPServer {
  const ruleRouting = normalizeRuleRouting(server.ruleRouting);
  const aiRouting = normalizeAIRouting(server.aiRouting);

  return {
    ...server,
    isPreset: isProtectedMCPServerId(server.id),
    timeout: typeof server.timeout === 'number' && Number.isFinite(server.timeout) && server.timeout > 0
      ? server.timeout
      : DEFAULT_MCP_TIMEOUT,
    mode: normalizeRoutingMode(server.mode, aiRouting),
    ruleRouting,
    aiRouting,
  };
}

export function validateMCPServerForSave(
  input: unknown,
  options?: { requireName?: boolean }
): MCPServerValidationResult {
  const errors: string[] = [];
  const requireName = options?.requireName ?? true;

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Invalid payload'] };
  }

  const payload = input as Record<string, unknown>;
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (requireName && !name) {
    errors.push('name is required');
  }

  const transport = payload.transport;
  if (transport !== 'stdio' && transport !== 'sse' && transport !== 'http') {
    errors.push('transport must be stdio, sse, or http');
  }

  const config = payload.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push('config must be an object');
  } else {
    const configObj = config as Record<string, unknown>;
    if ((transport === 'sse' || transport === 'http') && !(typeof configObj.url === 'string' && configObj.url.trim())) {
      errors.push('config.url is required for sse/http transport');
    }

    if (transport === 'stdio') {
      if (!(typeof configObj.command === 'string' && configObj.command.trim())) {
        errors.push('config.command is required for stdio transport');
      }

      if (typeof configObj.args !== 'undefined') {
        if (!Array.isArray(configObj.args) || !configObj.args.every((arg) => typeof arg === 'string')) {
          errors.push('config.args must be an array of strings');
        }
      }
    }
  }

  const timeout = payload.timeout;
  if (!(typeof timeout === 'number' && Number.isFinite(timeout) && timeout >= 1000)) {
    errors.push('timeout must be a number >= 1000');
  }

  const mode = payload.mode;
  if (typeof mode !== 'undefined' && mode !== 'rule' && mode !== 'ai' && mode !== 'hybrid') {
    errors.push('mode must be rule, ai, or hybrid');
  }

  const aiRouting = payload.aiRouting;
  if (typeof aiRouting !== 'undefined') {
    if (!aiRouting || typeof aiRouting !== 'object' || Array.isArray(aiRouting)) {
      errors.push('aiRouting must be an object');
    } else {
      const aiObj = aiRouting as Record<string, unknown>;
      if (aiObj.provider !== 'ollama' && aiObj.provider !== 'openai') {
        errors.push('aiRouting.provider must be ollama or openai');
      }

      if (!(typeof aiObj.model === 'string' && aiObj.model.trim())) {
        errors.push('aiRouting.model is required');
      }

      if (!(typeof aiObj.systemPrompt === 'string' && aiObj.systemPrompt.trim())) {
        errors.push('aiRouting.systemPrompt is required');
      }

      const allowedTools = Array.isArray(aiObj.allowedTools)
        ? aiObj.allowedTools.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
        : null;

      if (!allowedTools) {
        errors.push('aiRouting.allowedTools must be an array of strings');
      } else {
        if (new Set(allowedTools).size !== allowedTools.length) {
          errors.push('aiRouting.allowedTools contains duplicates');
        }

        if (typeof aiObj.fallbackTool === 'string' && aiObj.fallbackTool.trim()) {
          if (!allowedTools.includes(aiObj.fallbackTool.trim())) {
            errors.push('aiRouting.fallbackTool must be included in aiRouting.allowedTools');
          }
        }
      }
    }
  }

  const ruleRouting = payload.ruleRouting;
  if (typeof ruleRouting !== 'undefined') {
    if (!ruleRouting || typeof ruleRouting !== 'object' || Array.isArray(ruleRouting)) {
      errors.push('ruleRouting must be an object');
    } else {
      const ruleObj = ruleRouting as Record<string, unknown>;
      if (!Array.isArray(ruleObj.rules)) {
        errors.push('ruleRouting.rules must be an array');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function loadStoreFromFile(): MCPServerStore {
  try {
    const filePath = path.resolve(process.cwd(), MCP_SERVERS_CONFIG_PATH);
    if (!fs.existsSync(filePath)) {
      return { servers: [] };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    if (parsed?.servers && Array.isArray(parsed.servers)) {
      return {
        servers: (parsed.servers as MCPServer[]).map((server) => normalizeMCPServer(server)),
      };
    }

    return { servers: [] };
  } catch (err) {
    console.error('Error loading MCP servers store:', err);
    return { servers: [] };
  }
}

function writeStoreToFile(store: MCPServerStore): void {
  const filePath = path.resolve(process.cwd(), MCP_SERVERS_CONFIG_PATH);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * 全MCPサーバーを取得
 */
export function getAllMCPServers(): MCPServer[] {
  const store = loadStoreFromFile();
  return sortMCPServers(store.servers);
}

/**
 * 指定IDのMCPサーバーを取得
 */
export function getMCPServerById(id: string): MCPServer | undefined {
  const store = loadStoreFromFile();
  return store.servers.find((server) => server.id === id);
}

/**
 * MCPサーバーを作成
 */
export function createMCPServer(input: {
  name: string;
  description?: string;
  transport: 'stdio' | 'sse' | 'http';
  config: {
    command?: string;
    args?: string[];
    url?: string;
  };
  enabled?: boolean;
  timeout?: number;
  mode?: MCPRoutingMode;
  ruleRouting?: MCPRuleRoutingConfig;
  aiRouting?: MCPAIRoutingConfig;
}): MCPServer {
  const store = loadStoreFromFile();
  const baseId = sanitizeId(input.name, 'mcp_server');

  let id = baseId;
  let suffix = 1;
  while (store.servers.some((server) => server.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  const created = normalizeMCPServer({
    id,
    name: input.name,
    description: input.description || '',
    transport: input.transport,
    config: input.config,
    enabled: input.enabled ?? true,
    timeout: typeof input.timeout === 'number' ? input.timeout : DEFAULT_MCP_TIMEOUT,
    mode: input.mode,
    ruleRouting: input.ruleRouting,
    aiRouting: input.aiRouting,
    createdAt: now,
    updatedAt: now,
  });

  store.servers.push(created);
  writeStoreToFile(store);
  return created;
}

/**
 * MCPサーバーを更新
 */
export function updateMCPServer(id: string, updates: Partial<MCPServer>): MCPServer | null {
  const store = loadStoreFromFile();
  const index = store.servers.findIndex((server) => server.id === id);

  if (index === -1) {
    return null;
  }

  const updated = normalizeMCPServer({
    ...store.servers[index],
    ...updates,
    id: store.servers[index].id,
    createdAt: store.servers[index].createdAt,
    updatedAt: new Date().toISOString(),
  });

  store.servers[index] = updated;

  try {
    writeStoreToFile(store);
    return updated;
  } catch (err) {
    console.error('Error updating MCP server:', err);
    return null;
  }
}

/**
 * MCPランタイム実行結果を保存
 */
export function setMCPServerRuntimeStatus(
  id: string,
  input: {
    success: boolean;
    toolName?: string;
    error?: string;
  }
): MCPServer | null {
  const store = loadStoreFromFile();
  const index = store.servers.findIndex((server) => server.id === id);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: MCPServer = {
    ...store.servers[index],
    lastRuntimeSuccess: input.success,
    lastRuntimeAt: now,
    lastRuntimeToolName: input.toolName,
    lastRuntimeError: input.success ? undefined : input.error || 'Unknown MCP runtime error',
    updatedAt: now,
  };

  store.servers[index] = updated;

  try {
    writeStoreToFile(store);
    return updated;
  } catch (err) {
    console.error('Error updating MCP runtime status:', err);
    return null;
  }
}

/**
 * MCPサーバーを削除
 * - ドメインで参照中のサーバーは削除不可
 */
export function deleteMCPServer(id: string): boolean {
  if (isProtectedMCPServerId(id)) {
    return false;
  }

  const store = loadStoreFromFile();
  const index = store.servers.findIndex((server) => server.id === id);

  if (index === -1) {
    return false;
  }

  // ドメインから参照されていないか確認
  const domains = getAllDomains();
  const isReferenced = domains.some((domain) => (domain.mcpServerIds || []).includes(id));

  if (isReferenced) {
    return false;
  }

  store.servers.splice(index, 1);

  try {
    writeStoreToFile(store);
    return true;
  } catch (err) {
    console.error('Error deleting MCP server:', err);
    return false;
  }
}

/**
 * MCPサーバーの接続テスト（簡易版）
 * 実際の実装はPhase 2で拡張
 */
export async function testMCPServerConnection(id: string): Promise<{
  success: boolean;
  message: string;
  latency?: number;
}> {
  const server = getMCPServerById(id);

  if (!server) {
    return { success: false, message: 'MCPサーバーが見つかりません' };
  }

  try {
    const startTime = Date.now();

    if (server.transport === 'http' && server.config.url) {
      const probes = buildHealthProbeCandidates(server.id, server.config.url);
      let lastError = '';

      for (const probeUrl of probes) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), server.timeout);

        try {
          const response = await fetch(probeUrl, {
            method: 'GET',
            signal: controller.signal,
          });

          const latency = Date.now() - startTime;
          if (response.ok) {
            return {
              success: true,
              message: `HTTPサーバーに接続できました (${probeUrl})`,
              latency,
            };
          }

          lastError = `HTTP ${response.status} (${probeUrl})`;
        } catch (err) {
          lastError = err instanceof Error ? `${err.message} (${probeUrl})` : `接続失敗 (${probeUrl})`;
        } finally {
          clearTimeout(timeout);
        }
      }

      return {
        success: false,
        message: lastError || 'HTTP接続テストに失敗しました',
      };
    }

    if (server.transport === 'sse' && server.config.url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), server.timeout);

      try {
        const response = await fetch(server.config.url, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const latency = Date.now() - startTime;
        return {
          success: response.ok,
          message: response.ok ? 'SSEサーバーに接続できました' : `HTTP ${response.status}`,
          latency,
        };
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }

    if (server.transport === 'stdio') {
      return {
        success: false,
        message: 'stdio接続テストはPhase 2で実装予定です',
      };
    }

    return { success: false, message: '不明なトランスポート' };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return { success: false, message };
  }
}
