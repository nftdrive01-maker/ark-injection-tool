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

export interface MCPExecutionResult {
  success: boolean;
  serverId?: string;
  serverName?: string;
  toolName?: string;
  output?: string;
  error?: string;
}

const MCP_ALWAYS_ON = process.env.INJECTION_MCP_ALWAYS_ON === 'true';
const MCP_DEFAULT_TOOL = process.env.INJECTION_MCP_DEFAULT_TOOL || 'get_current_time';
const MCP_ROUTER_TIMEOUT_MS = parseInt(process.env.INJECTION_MCP_ROUTER_TIMEOUT || '6000', 10);

interface ToolDecision {
  name: string;
  args: Record<string, unknown>;
}

const SEARCH_TOOL_ALIASES = ['search_web', 'web_search', 'search'] as const;

function buildWebSearchUrl(query: string): string {
  const q = encodeURIComponent(query.trim() || '最新情報');
  return `https://duckduckgo.com/html/?q=${q}`;
}

function shouldUseMCP(userText: string): boolean {
  if (MCP_ALWAYS_ON) {
    return true;
  }

  return /(mcp|時刻|時間|何時|天気|weather|tool|計算|calculate|calc|式|ツール一覧|list tools|検索|調べて|search|lookup|find)/i.test(userText);
}

function extractSearchQuery(userText: string): string {
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

  return normalized || userText.trim() || '最新情報';
}

function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)\]}>"']+/i);
  return match?.[0] || null;
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

function createFallbackDecision(userText: string): ToolDecision {
  if (/(検索|調べて|search|lookup|find)/i.test(userText)) {
    return { name: 'search_web', args: { query: extractSearchQuery(userText) } };
  }

  if (/(天気|weather)/i.test(userText)) {
    return { name: 'get_mock_weather', args: { city: pickWeatherCity(userText) } };
  }

  if (/(計算|calculate|calc|式)/i.test(userText)) {
    return { name: 'calculate', args: { expression: extractExpression(userText) || '0 + 0' } };
  }

  if (/(ツール一覧|使えるツール|list tools|tools list)/i.test(userText)) {
    return { name: 'list_tools_info', args: {} };
  }

  if (/(echo|オウム返し)/i.test(userText)) {
    return { name: 'echo', args: { message: userText.slice(0, 200) } };
  }

  if (/(時刻|時間|何時|current time|time now)/i.test(userText)) {
    return { name: 'get_current_time', args: {} };
  }

  return { name: MCP_DEFAULT_TOOL, args: {} };
}

function normalizeToolArguments(toolName: string, args: Record<string, unknown>, userText: string): Record<string, unknown> {
  if (toolName === 'fetch_url') {
    const directUrl = typeof args.url === 'string' && args.url.trim() ? args.url.trim() : '';
    const query = typeof args.query === 'string' && args.query.trim()
      ? args.query.trim()
      : typeof args.q === 'string' && args.q.trim()
        ? args.q.trim()
        : typeof args.keyword === 'string' && args.keyword.trim()
          ? args.keyword.trim()
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
      ? args.query.trim()
      : typeof args.q === 'string' && args.q.trim()
        ? args.q.trim()
        : typeof args.keyword === 'string' && args.keyword.trim()
          ? args.keyword.trim()
          : extractSearchQuery(userText);
    return { query };
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

function createAiRouterUserPrompt(userText: string, ai: MCPAIRoutingConfig): string {
  return [
    `userText: ${userText}`,
    `allowedTools: ${JSON.stringify(ai.allowedTools)}`,
    '出力はJSONのみで返してください。',
    'toolは allowedTools から選ぶか no_tool にしてください。',
  ].join('\n');
}

async function callOllamaRouter(userText: string, ai: MCPAIRoutingConfig, timeoutMs: number): Promise<string> {
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
          { role: 'user', content: createAiRouterUserPrompt(userText, ai) },
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

async function callOpenAiRouter(userText: string, ai: MCPAIRoutingConfig, timeoutMs: number): Promise<string> {
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
          { role: 'user', content: createAiRouterUserPrompt(userText, ai) },
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

async function resolveAIDecision(server: MCPServer, userText: string): Promise<ToolDecision | null> {
  const ai = server.aiRouting;
  if (!ai?.enabled) {
    return null;
  }

  const timeoutMs = Math.max(1000, Math.min(server.timeout, MCP_ROUTER_TIMEOUT_MS));
  const rawContent = ai.provider === 'openai'
    ? await callOpenAiRouter(userText, ai, timeoutMs)
    : await callOllamaRouter(userText, ai, timeoutMs);

  const parsed = parseRouterJson(rawContent);
  if (!parsed?.tool) {
    return null;
  }

  if (parsed.tool === 'no_tool') {
    return null;
  }

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 1;
  if (confidence < ai.confidenceThreshold) {
    if (ai.fallbackTool && ai.allowedTools.includes(ai.fallbackTool)) {
      return {
        name: ai.fallbackTool,
        args: normalizeToolArguments(ai.fallbackTool, {}, userText),
      };
    }
    return null;
  }

  if (!ai.allowedTools.includes(parsed.tool)) {
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

async function pickToolAndArgs(server: MCPServer, userText: string): Promise<ToolDecision | null> {
  const mode = server.mode || 'rule';

  if (mode === 'rule') {
    return resolveRuleDecision(server, userText) || (MCP_ALWAYS_ON ? createFallbackDecision(userText) : null);
  }

  if (mode === 'ai') {
    return (await resolveAIDecision(server, userText)) || (MCP_ALWAYS_ON ? createFallbackDecision(userText) : null);
  }

  const byRule = resolveRuleDecision(server, userText);
  if (byRule) {
    return byRule;
  }

  return (await resolveAIDecision(server, userText)) || (MCP_ALWAYS_ON ? createFallbackDecision(userText) : null);
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

async function createTransport(server: MCPServer) {
  if (server.transport === 'sse') {
    if (!server.config.url) {
      throw new Error('SSE URLが未設定です');
    }
    return new SSEClientTransport(new URL(server.config.url));
  }

  if (server.transport === 'http') {
    if (!server.config.url) {
      throw new Error('HTTP URLが未設定です');
    }
    return new StreamableHTTPClientTransport(new URL(server.config.url));
  }

  throw new Error('stdioトランスポートはPhase 2対象外です');
}

async function callServerTool(server: MCPServer, userText: string): Promise<MCPExecutionResult> {
  const transport = await createTransport(server);
  const client = new Client({
    name: 'injection-tool',
    version: '1.0.0',
  });
  let selectedToolName: string | undefined;

  try {
    const decision = await pickToolAndArgs(server, userText);
    if (!decision) {
      return {
        success: false,
        serverId: server.id,
        serverName: server.name,
        error: 'ツール選択条件に一致しませんでした',
      };
    }

    const { name, args } = decision;
    selectedToolName = name;

    await client.connect(transport);

    const listToolsResult = await client.listTools();
    const availableTools = toToolNameList(listToolsResult);
    const executable = resolveExecutableTool(name, args, availableTools, userText);

    if (!executable) {
      return {
        success: false,
        serverId: server.id,
        serverName: server.name,
        toolName: selectedToolName,
        error: `要求ツール '${name}' はサーバー未実装です（available: ${availableTools.join(', ') || 'none'}）`,
      };
    }

    selectedToolName = executable.name;

    const callResult = await client.callTool({
      name: executable.name,
      arguments: executable.args,
    });

    return {
      success: true,
      serverId: server.id,
      serverName: server.name,
      toolName: executable.name,
      output: extractTextContent(callResult),
    };
  } catch (err) {
    return {
      success: false,
      serverId: server.id,
      serverName: server.name,
      toolName: selectedToolName,
      error: err instanceof Error ? err.message : 'Unknown MCP error',
    };
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function executeMCPForDomain(input: {
  mcpServerIds?: string[];
  userText: string;
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
    if (requiresDecision && !MCP_ALWAYS_ON && !shouldUseMCP(userText)) {
      continue;
    }

    const result = await callServerTool(server, userText);

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
  };
}
