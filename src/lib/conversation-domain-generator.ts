type GenerationMode = 'knowledge-only' | 'attach-domain' | 'create-domain';

export type GeneratedKnowledgeDraft = {
  name: string;
  description: string;
  systemPrompt: string;
  context: string;
  priority: number;
};

export type GeneratedDomainDraft = {
  name: string;
  description: string;
  characterName: string;
  baseSystemPrompt: string;
  baseContext: string;
  themeColor: string;
};

export type GeneratedConversationPackage = {
  knowledge: GeneratedKnowledgeDraft;
  domain: GeneratedDomainDraft;
  provider: 'ollama' | 'openai';
  model: string;
};

type GenerateConversationPackageInput = {
  conversation: string;
  mode: GenerationMode;
  knowledgeNameHint?: string;
  domainNameHint?: string;
  templateLabel?: string;
  templateInstructions?: string;
};

type AiProvider = 'ollama' | 'openai';

type ProviderConfig = {
  provider: AiProvider;
  model: string;
};

const DEFAULT_MODEL = process.env.INJECTION_DOMAIN_GENERATOR_MODEL
  || process.env.INJECTION_MCP_ROUTER_MODEL
  || process.env.NEXT_PUBLIC_OLLAMA_MODEL
  || 'qwen2.5:7b';

const DEFAULT_THEME_COLOR = '#2563eb';
const REQUEST_TIMEOUT_MS = 120000;

function resolveProviderConfig(): ProviderConfig {
  const requestedProvider = process.env.INJECTION_DOMAIN_GENERATOR_PROVIDER?.trim().toLowerCase();
  const provider: AiProvider = requestedProvider === 'openai'
    ? 'openai'
    : requestedProvider === 'ollama'
      ? 'ollama'
      : process.env.INJECTION_OPENAI_API_KEY
        ? 'openai'
        : 'ollama';

  return {
    provider,
    model: DEFAULT_MODEL,
  };
}

function sanitizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function sanitizeThemeColor(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_THEME_COLOR;
  }

  const trimmed = value.trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return DEFAULT_THEME_COLOR;
  }

  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function parseJsonObject(rawContent: string): Record<string, unknown> {
  const trimmed = rawContent.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('生成結果のJSON解析に失敗しました');
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemPrompt(): string {
  return [
    'You generate reusable knowledge and domain definitions for Ark-i injection-tool.',
    'Return strict JSON only. Do not include markdown fences.',
    'Output language must be Japanese.',
    'Do not invent facts not supported by the conversation.',
    'Structure the knowledge for later reuse by another AI domain.',
    'When the conversation implies concierge or guidance use cases, produce a practical domain prompt.',
    'Keep systemPrompt and baseSystemPrompt concise but actionable.',
    'Keep context detailed and structured with headings and bullet-like lines.',
    'Output schema:',
    '{',
    '  "knowledge": {',
    '    "name": string,',
    '    "description": string,',
    '    "systemPrompt": string,',
    '    "context": string,',
    '    "priority": number',
    '  },',
    '  "domain": {',
    '    "name": string,',
    '    "description": string,',
    '    "characterName": string,',
    '    "baseSystemPrompt": string,',
    '    "baseContext": string,',
    '    "themeColor": string',
    '  }',
    '}',
  ].join('\n');
}

function buildUserPrompt(input: GenerateConversationPackageInput): string {
  return [
    `mode: ${input.mode}`,
    `knowledgeNameHint: ${input.knowledgeNameHint || '(none)'}`,
    `domainNameHint: ${input.domainNameHint || '(none)'}`,
    `templateLabel: ${input.templateLabel || '(none)'}`,
    '',
    'Requirements:',
    '- knowledge.name should be a short reusable title.',
    '- knowledge.description should explain what operational knowledge this captures.',
    '- knowledge.systemPrompt should instruct later assistants to rely on this knowledge.',
    '- knowledge.context should be organized for reuse, with headings and concise factual bullets.',
    '- domain.name should fit a domain users can select in Ark-i.',
    '- domain.description should explain what the domain helps with.',
    '- domain.characterName should be short and natural.',
    '- domain.baseSystemPrompt should make the assistant practical, concise, and evidence-aware.',
    '- domain.baseContext may be empty unless stable background instructions are needed.',
    '- themeColor must be a hex color like #2563eb.',
    '- If the conversation is mostly requirements, create a domain suitable for those requirements.',
    '- If facts are uncertain, reflect that as caution rather than inventing detail.',
    ...(input.templateInstructions
      ? ['', 'Selected template guidance:', input.templateInstructions.trim()]
      : []),
    '',
    'Conversation:',
    input.conversation.trim(),
  ].join('\n');
}

async function callOllama(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const baseUrl = process.env.INJECTION_OLLAMA_URL || 'http://127.0.0.1:11434';
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          num_predict: 2400,
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Ollama generation error: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama generation returned empty content');
  }
  return content;
}

async function callOpenAi(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
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
        model,
        temperature: 0.2,
        max_tokens: 2400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`OpenAI generation error: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI generation returned empty content');
  }
  return content;
}

function normalizePackage(parsed: Record<string, unknown>, input: GenerateConversationPackageInput, config: ProviderConfig): GeneratedConversationPackage {
  const knowledgeRaw = (parsed.knowledge && typeof parsed.knowledge === 'object') ? parsed.knowledge as Record<string, unknown> : {};
  const domainRaw = (parsed.domain && typeof parsed.domain === 'object') ? parsed.domain as Record<string, unknown> : {};

  const knowledgeName = sanitizeText(knowledgeRaw.name, input.knowledgeNameHint || '会話生成ナレッジ');
  const domainName = sanitizeText(domainRaw.name, input.domainNameHint || `${knowledgeName}コンシェルジュ`);

  return {
    knowledge: {
      name: knowledgeName,
      description: sanitizeText(knowledgeRaw.description, '会話から抽出した運用・案内ナレッジです。'),
      systemPrompt: sanitizeText(knowledgeRaw.systemPrompt, '以下は会話から構造化した知識です。必要時に根拠として参照してください。'),
      context: sanitizeText(knowledgeRaw.context, input.conversation.trim()),
      priority: typeof knowledgeRaw.priority === 'number' && Number.isFinite(knowledgeRaw.priority)
        ? Math.max(1, Math.min(999, Math.floor(knowledgeRaw.priority)))
        : 90,
    },
    domain: {
      name: domainName,
      description: sanitizeText(domainRaw.description, `${domainName} に関する会話内容をもとに生成した案内ドメインです。`),
      characterName: sanitizeText(domainRaw.characterName, domainName),
      baseSystemPrompt: sanitizeText(domainRaw.baseSystemPrompt, `あなたは「${domainName}」です。アタッチされたナレッジを最優先の根拠として、日本語で丁寧かつ実務的に回答してください。`),
      baseContext: sanitizeText(domainRaw.baseContext, ''),
      themeColor: sanitizeThemeColor(domainRaw.themeColor),
    },
    provider: config.provider,
    model: config.model,
  };
}

export async function generateConversationPackage(input: GenerateConversationPackageInput): Promise<GeneratedConversationPackage> {
  const config = resolveProviderConfig();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);
  const rawContent = config.provider === 'openai'
    ? await callOpenAi(systemPrompt, userPrompt, config.model)
    : await callOllama(systemPrompt, userPrompt, config.model);

  const parsed = parseJsonObject(rawContent);
  return normalizePackage(parsed, input, config);
}