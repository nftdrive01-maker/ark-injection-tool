'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toKana } from 'wanakana';

interface Domain {
  id: string;
  name: string;
  description: string;
  enabled?: boolean;
  sharedLogEnabled?: boolean;
  accessControlEnabled?: boolean;
  accessUsers?: DomainAccessUser[];
  baseSystemPrompt: string;
  baseContext: string;
  bgUrl?: string;
  themeColor?: string;
  characterName?: string;
  vrmEnabled?: boolean;
  vrmUrl?: string;
  imageAvatarIdleUrl?: string;
  imageAvatarTalkUrl?: string;
  imageAvatarTalkIntervalMs?: number;
  ttsMuted?: boolean;
  gazeWakeEnabled?: boolean;
  gazeHoldMs?: number;
  gazeReleaseMs?: number;
  gazeCooldownMs?: number;
  gazeGreetings?: string[];
  gazeDebugUiEnabled?: boolean;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  knowledgeIds: string[];
  memoryIds?: string[];
  mcpServerIds?: string[];
  chronicleIds?: string[];
  systemPrompt: string;
  context: string;
  version: string;
  ttl: number;
}

interface DomainAccessUser {
  id: string;
  username: string;
  passwordHash?: string;
  password?: string;
  updatedAt?: string;
}

interface Chronicle {
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

interface Knowledge {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  context: string;
  enabled: boolean;
  priority: number;
  updatedAt: string;
}

interface Memory {
  id: string | number;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  block_height?: number;
  network?: string;
  summary?: string;
  item_count?: number;
}

interface PronunciationRule {
  id: string;
  from: string;
  to: string;
  enabled: boolean;
  priority: number;
  domainId?: string;
  updatedAt: string;
}

interface PronunciationSettings {
  wanaKanaEnabled: boolean;
  updatedAt?: string;
}

interface RuntimeModelInfo {
  backend: string;
  modelName: string;
  modelSource: 'amica' | 'env' | 'default';
  contextLength: number;
  contextSource: 'api_show' | 'modelfile' | 'metadata' | 'default';
  amicaConfigFetched: boolean;
  ollamaFetched: boolean;
}

interface AssetFile {
  name: string;
  url: string;
}

interface Sbv2ModelOption {
  id: string;
  name: string;
  speakerNames: string[];
  speakerCount: number;
  isMultiSpeaker: boolean;
}

interface SessionStatus {
  current: number;
  max: number;
  available: boolean;
}

interface AdminLoginHistoryEntry {
  timestamp: string;
  ip: string;
  success: boolean;
}

interface SharedLogEntry {
  historyId: string;
  domainId: string;
  userId?: string;
  role: 'assistant' | 'system' | 'user';
  content: string;
  createdAt: number;
  createdAtDayKey: string;
  sessionId?: string;
  dbResult?: {
    title?: string;
    sourceName?: string;
    toolName?: string;
    summary?: string;
    queryText?: string;
    sortLabel?: string;
    totalCount?: number;
    previewColumns?: string[];
    previewRows?: Array<Record<string, string | number | boolean | null>>;
  };
  mcpInfo?: {
    used?: boolean;
    serverId?: string;
    toolName?: string;
  };
}

interface DomainTestChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface DomainTestChatResult {
  backend?: string;
  modelName?: string;
  intercept?: {
    dbResult?: {
      title?: string;
      sourceName?: string;
      toolName?: string;
      summary?: string;
    };
    chronicle?: {
      title?: string;
      content?: string;
      sourceName?: string;
    };
    metadata?: {
      requestId?: string;
      mcpUsed?: boolean;
      mcpServerId?: string;
      mcpToolName?: string;
      mcpError?: string;
      chronicleUsed?: boolean;
      chronicleName?: string;
      chronicleError?: string;
    };
  };
}

interface PublicManagementSettings {
  maxConcurrentSessions: number;
  chatRequestsPerUserPerMinute: number;
  ttsRequestsPerUserPerMinute: number;
}

interface CloudflareTunnelStatus {
  active: boolean;
  starting: boolean;
  publicUrl: string | null;
  targetUrl: string;
  pid: number | null;
  startedAt: number | null;
  lastError: string | null;
}

interface CloudflareTunnelTargetOption {
  id: string;
  label: string;
  description: string;
  url: string;
}

interface MCPServer {
  id: string;
  name: string;
  description: string;
  isPreset?: boolean;
  transport: 'stdio' | 'sse' | 'http';
  mode?: 'rule' | 'ai' | 'hybrid';
  config: {
    command?: string;
    args?: string[];
    url?: string;
  };
  enabled: boolean;
  timeout: number;
  ruleRouting?: {
    enabled: boolean;
    rules: Array<{
      id: string;
      enabled: boolean;
      priority: number;
      keywords: string[];
      toolName: string;
      argsTemplate?: Record<string, unknown>;
    }>;
  };
  aiRouting?: {
    enabled: boolean;
    provider: 'ollama' | 'openai';
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    confidenceThreshold: number;
    allowedTools: string[];
    fallbackTool?: string;
  };
  lastRuntimeSuccess?: boolean;
  lastRuntimeAt?: string;
  lastRuntimeToolName?: string;
  lastRuntimeError?: string;
  createdAt: string;
  updatedAt: string;
}

type AssetType = 'vrm' | 'bgimage';

const DEFAULT_GAZE_GREETINGS = [
  '何か御用がありますか？',
  'お待ちしていました。どうしましたか？',
  'こんにちは。必要なことがあれば教えてください。',
  '目が合いましたね。今日は何をお手伝いしましょうか？',
];

const DANGER_LINE_PERCENT = 90;
const WARNING_LINE_PERCENT = 75;
const SELECTED_DOMAIN_STORAGE_KEY = 'arki_selected_domain_id';
const SESSION_AUTH_PLACEHOLDER = 'cookie-session';
const SHARED_LOG_ALL_DOMAINS = '__all__';
const SHARED_LOG_ALL_USERS = '__all__';
const SHARED_LOG_ALL_SESSIONS = '__all__';
const LATIN_WORD_PATTERN = /https?:\/\/\S+|www\.\S+|[A-Za-z][A-Za-z'-]*/g;

interface DomainPromptTemplate {
  id: string;
  label: string;
  description: string;
  content: string;
}

type DomainSubTab = 'basic' | 'prompt' | 'experience' | 'connections' | 'test';

const DOMAIN_PROMPT_TEMPLATES: DomainPromptTemplate[] = [
  {
    id: 'generic-concierge',
    label: '汎用コンシェルジュ',
    description: '業種を問わず使える案内AI向けテンプレート',
    content: `あなたは「{{assistant_name}}」です。{{organization_name}} に関する案内・相談対応を行うコンシェルジュとして振る舞ってください。\n\n# 最優先ルール\n- 回答は、アタッチされたナレッジ（公式情報）を最優先で根拠にする。\n- ナレッジにない情報は断定しない。必要に応じて「未確認」と明示する。\n- 事実と推測を分けて説明する。\n\n# 応答スタイル\n- 丁寧で安心感のある、です・ます調で回答する。\n- 最初に結論を短く示し、その後に必要な詳細を述べる。\n- 専門用語は可能な限り平易な表現に言い換える。\n\n# 案内方針\n- ユーザーの目的を整理し、次に取る行動を具体的に提示する。\n- 日時・場所・手続き・連絡先など実務情報を優先する。\n- 不足情報がある場合は確認質問を1〜2個だけ行う。`,
  },
  {
    id: 'school-concierge',
    label: '学校案内コンシェルジュ',
    description: '学校紹介・入試・行事案内向けテンプレート',
    content: `あなたは「{{assistant_name}}」です。{{organization_name}} の学校案内コンシェルジュとして、受験生・保護者・在校生・卒業生の質問に回答してください。\n\n# 最優先ルール\n- 回答は、アタッチされた学校ナレッジ（公式サイト由来）を優先する。\n- 募集要項・日程・費用・制度は、記載がある場合のみ回答し、未記載は要確認とする。\n\n# 案内方針\n- 質問意図を把握し、対象者（受験生/保護者/在校生/卒業生）に合わせて案内する。\n- 入試、オープンスクール、コース、部活動、進路、各種証明書の案内を優先する。\n- 緊急連絡や手続きは、窓口・連絡先・必要書類を分かりやすく提示する。\n\n# 応答スタイル\n- 親しみやすく丁寧な、です・ます調で回答する。\n- まず結論、次に根拠、最後に次アクションの順で回答する。`,
  },
  {
    id: 'company-concierge',
    label: '企業案内コンシェルジュ',
    description: '企業紹介・製品サービス案内向けテンプレート',
    content: `あなたは「{{assistant_name}}」です。{{organization_name}} の企業案内コンシェルジュとして、会社情報・製品サービス・採用・お問い合わせに関する案内を行ってください。\n\n# 最優先ルール\n- 公式ナレッジに基づいて回答する。\n- 未確認情報は断定せず、確認方法を提示する。\n\n# 案内方針\n- ユーザーの目的（購入検討/導入相談/採用/問い合わせ）を明確化する。\n- 必要な情報を簡潔に整理し、関連ページや窓口につなぐ。\n- 価格・契約・法務に関する事項は、公式窓口確認を促す。\n\n# 応答スタイル\n- 簡潔・明瞭・丁寧に回答する。\n- 箇条書きで比較・選択肢を提示し、次の行動を示す。`,
  },
  {
    id: 'public-concierge',
    label: '自治体・公共案内コンシェルジュ',
    description: '行政手続き・公共サービス案内向けテンプレート',
    content: `あなたは「{{assistant_name}}」です。{{organization_name}} の公共案内コンシェルジュとして、住民向けの手続き・制度・窓口案内を支援してください。\n\n# 最優先ルール\n- 公式ナレッジを根拠に回答する。\n- 制度の要件・期限・必要書類は、根拠があるもののみ明示する。\n\n# 案内方針\n- 目的を確認し、対象手続きの概要、必要書類、申請先、受付時間を案内する。\n- ケースにより条件が異なる場合は、該当条件を確認質問で絞り込む。\n- 重要な判断が必要な場合は公式窓口での最終確認を促す。\n\n# 応答スタイル\n- 正確性を重視し、簡潔で丁寧に説明する。\n- 結論→根拠→次アクションの順で回答する。`,
  },
];

function renderDomainPromptTemplate(template: DomainPromptTemplate, domain: Domain): string {
  const assistantName = (domain.characterName || '').trim() || `${domain.name}コンシェルジュ`;
  const organizationName = (domain.name || '').trim() || '対象組織';

  return template.content
    .replace(/\{\{assistant_name\}\}/g, assistantName)
    .replace(/\{\{organization_name\}\}/g, organizationName);
}

function applyWanaKanaFallback(input: string, enabled: boolean): string {
  if (!enabled || !input) {
    return input;
  }

  return input.replace(LATIN_WORD_PATTERN, (segment) => {
    if (/^https?:\/\//i.test(segment) || /^www\./i.test(segment)) {
      return segment;
    }

    if (segment.length < 2 || !/[aeiou]/i.test(segment)) {
      return segment;
    }

    const converted = toKana(segment.toLowerCase());
    return /[ぁ-んァ-ヶ]/.test(converted) ? converted : segment;
  });
}

function isCjkChar(char: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/.test(char);
}

function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }

  const chars = [...text];
  const cjkCount = chars.filter((char) => isCjkChar(char)).length;
  const nonCjkCount = chars.length - cjkCount;
  return Math.max(1, Math.ceil(cjkCount * 1.2 + nonCjkCount / 4));
}

function formatAdminTimestamp(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return new Date(value).toLocaleString('ja-JP');
}

function formatSharedLogRoleLabel(role: SharedLogEntry['role']): string {
  if (role === 'user') {
    return 'あなた';
  }

  if (role === 'assistant') {
    return '応答';
  }

  return 'システム';
}

function createDownloadTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function sanitizeDownloadLabel(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function normalizeAdminDomain(domain: Domain): Domain {
  return {
    ...domain,
    themeColor: typeof domain.themeColor === 'string' ? domain.themeColor : '',
    accessControlEnabled: domain.accessControlEnabled === true,
    accessUsers: Array.isArray(domain.accessUsers)
      ? domain.accessUsers.map((user) => ({
          id: user.id,
          username: user.username,
          passwordHash: user.passwordHash,
          password: '',
          updatedAt: user.updatedAt,
        }))
      : [],
  };
}

function createAdminPreviewSessionId(domainId: string): string {
  return `admin-preview-${domainId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminPage() {
  const showDomainSiteAnalysis = false;
  const domainSubTabs: Array<{ id: DomainSubTab; label: string; description: string }> = [
    { id: 'basic', label: '基本設定', description: '有効化、説明、アクセス制御、TTL' },
    { id: 'prompt', label: 'プロンプト', description: 'テンプレート、ベースプロンプト、コンテキスト' },
    { id: 'experience', label: '表示・TTS', description: '見た目、アバター、読み上げ、視線起動' },
    { id: 'connections', label: '連携・構成', description: 'ナレッジ、MCP、CHRONICLE、メモリー' },
    { id: 'test', label: 'テストチャット', description: '未保存設定のまま応答とMCP挙動を確認' },
  ];

  const [domains, setDomains] = useState<Domain[]>([]);
  const [knowledges, setKnowledges] = useState<Knowledge[]>([]);
  const [pronunciations, setPronunciations] = useState<PronunciationRule[]>([]);
  const [pronunciationSettings, setPronunciationSettings] = useState<PronunciationSettings>({
    wanaKanaEnabled: false,
  });
  const [activeTab, setActiveTab] = useState<'domain' | 'shared-log' | 'knowledge' | 'chronicle' | 'asset' | 'pronunciation' | 'public' | 'mcp'>('domain');
  const [activeDomainSubTab, setActiveDomainSubTab] = useState<DomainSubTab>('basic');
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [chronicles, setChronicles] = useState<Chronicle[]>([]);
  const [selectedChronicle, setSelectedChronicle] = useState<Chronicle | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [updatingMemoryId, setUpdatingMemoryId] = useState<string | number | null>(null);
  const [selectedPronunciation, setSelectedPronunciation] = useState<PronunciationRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [savingPronunciation, setSavingPronunciation] = useState(false);
  const [savingPronunciationSettings, setSavingPronunciationSettings] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [authRedirecting, setAuthRedirecting] = useState(false);
  const [sharedLogs, setSharedLogs] = useState<SharedLogEntry[]>([]);
  const [sharedLogsLoading, setSharedLogsLoading] = useState(false);
  const [sharedLogsError, setSharedLogsError] = useState('');
  const [sharedLogsTotal, setSharedLogsTotal] = useState(0);
  const [sharedLogsLimit, setSharedLogsLimit] = useState(50);
  const [sharedLogDownloadBusy, setSharedLogDownloadBusy] = useState(false);
  const [sharedLogFilterDomainId, setSharedLogFilterDomainId] = useState('');
  const [sharedLogFilterUserId, setSharedLogFilterUserId] = useState(SHARED_LOG_ALL_USERS);
  const [sharedLogAvailableUserIds, setSharedLogAvailableUserIds] = useState<string[]>([]);
  const [sharedLogFilterSessionId, setSharedLogFilterSessionId] = useState(SHARED_LOG_ALL_SESSIONS);
  const [sharedLogAvailableSessionIds, setSharedLogAvailableSessionIds] = useState<string[]>([]);
  const [expandedSharedLogId, setExpandedSharedLogId] = useState<string | null>(null);
  const [runtimeModelInfo, setRuntimeModelInfo] = useState<RuntimeModelInfo | null>(null);
  const [runtimeInfoError, setRuntimeInfoError] = useState('');
  const [runtimeInfoLoading, setRuntimeInfoLoading] = useState(false);
  const [manualContextLimitInput, setManualContextLimitInput] = useState('');
  const [pronunciationTestInput, setPronunciationTestInput] = useState('');
  const [pronunciationTestDomainId, setPronunciationTestDomainId] = useState('');
  const [pronunciationTestOutput, setPronunciationTestOutput] = useState('');
  const [vrmAssets, setVrmAssets] = useState<AssetFile[]>([]);
  const [bgImageAssets, setBgImageAssets] = useState<AssetFile[]>([]);
  const [sbv2Models, setSbv2Models] = useState<Sbv2ModelOption[]>([]);
  const [sbv2ModelsError, setSbv2ModelsError] = useState('');
  const [sbv2TestText, setSbv2TestText] = useState('こんにちは、テスト音声です。');
  const [sbv2TestBusy, setSbv2TestBusy] = useState(false);
  const [sbv2TestError, setSbv2TestError] = useState('');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [sessionStatusError, setSessionStatusError] = useState('');
  const [adminLoginHistory, setAdminLoginHistory] = useState<AdminLoginHistoryEntry[]>([]);
  const [adminLoginHistoryLoading, setAdminLoginHistoryLoading] = useState(false);
  const [adminLoginHistoryError, setAdminLoginHistoryError] = useState('');
  const [publicSettings, setPublicSettings] = useState<PublicManagementSettings>({
    maxConcurrentSessions: 0,
    chatRequestsPerUserPerMinute: 0,
    ttsRequestsPerUserPerMinute: 0,
  });
  const [savingPublicSettings, setSavingPublicSettings] = useState(false);
  const [cloudflareTunnelStatus, setCloudflareTunnelStatus] = useState<CloudflareTunnelStatus | null>(null);
  const [cloudflareTunnelBusy, setCloudflareTunnelBusy] = useState(false);
  const [cloudflareTunnelError, setCloudflareTunnelError] = useState('');
  const [selectedTunnelTargetId, setSelectedTunnelTargetId] = useState('amica');
  const [uploadingAsset, setUploadingAsset] = useState<AssetType | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<AssetType | null>(null);
  const [domainTestChatMessages, setDomainTestChatMessages] = useState<DomainTestChatMessage[]>([]);
  const [domainTestChatInput, setDomainTestChatInput] = useState('');
  const [domainTestChatBusy, setDomainTestChatBusy] = useState(false);
  const [domainTestChatError, setDomainTestChatError] = useState('');
  const [domainTestChatResult, setDomainTestChatResult] = useState<DomainTestChatResult | null>(null);
  const sbv2PreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const sbv2PreviewUrlRef = useRef<string | null>(null);
  const domainTestChatSessionIdRef = useRef('');
  const tunnelTargetOptions = useMemo<CloudflareTunnelTargetOption[]>(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname || '127.0.0.1' : '127.0.0.1';

    return [
      {
        id: 'amica',
        label: 'Amica 本体 (3000)',
        description: 'チャット本体を公開します。通常はこちらを使います。',
        url: `http://${hostname}:3000`,
      },
      {
        id: 'admin',
        label: 'injection-tool 管理 (4001)',
        description: '管理画面を公開します。通常は避け、必要時のみ強い認証情報で限定公開してください。',
        url: `http://${hostname}:4001`,
      },
    ];
  }, []);
  const selectedTunnelTarget =
    tunnelTargetOptions.find((option) => option.id === selectedTunnelTargetId) || tunnelTargetOptions[0];
  const redirectToLogin = (reason = 'セッションが無効になりました。再ログインしてください') => {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.removeItem('injection_token');
    setMessage(reason);
    setAuthRedirecting(true);
    setLoading(false);
    window.location.replace('/login');
  };
  const handleUnauthorizedResponse = (status: number): boolean => {
    if (status !== 401) {
      return false;
    }

    redirectToLogin();
    return true;
  };
  const derivedGlobalChatRequestsPerMinute =
    publicSettings.maxConcurrentSessions > 0 && publicSettings.chatRequestsPerUserPerMinute > 0
      ? publicSettings.maxConcurrentSessions * publicSettings.chatRequestsPerUserPerMinute
      : 0;
  const derivedGlobalTtsRequestsPerMinute =
    publicSettings.maxConcurrentSessions > 0 && publicSettings.ttsRequestsPerUserPerMinute > 0
      ? publicSettings.maxConcurrentSessions * publicSettings.ttsRequestsPerUserPerMinute
      : 0;

  // MCP Server Management
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<MCPServer | null>(null);
  const [savingMcpServer, setSavingMcpServer] = useState(false);
  const [generatingMcpSystemPrompt, setGeneratingMcpSystemPrompt] = useState(false);
  const [mcpServersError, setMcpServersError] = useState('');
  const [mcpTestBusy, setMcpTestBusy] = useState<string | null>(null);
  const [mcpTestResults, setMcpTestResults] = useState<Record<string, { success: boolean; message: string; latency?: number }>>({});
  const [mcpRuleRoutingJsonInput, setMcpRuleRoutingJsonInput] = useState('[]');
  const [mcpRuleRoutingJsonError, setMcpRuleRoutingJsonError] = useState('');
  const [mcpStdioArgsInput, setMcpStdioArgsInput] = useState('[]');
  const [mcpStdioArgsError, setMcpStdioArgsError] = useState('');
  const [mcpAiAllowedToolInput, setMcpAiAllowedToolInput] = useState('');
  const [mcpAiAllowedToolsError, setMcpAiAllowedToolsError] = useState('');
  const [mcpImportUrl, setMcpImportUrl] = useState('');
  const [mcpImporting, setMcpImporting] = useState(false);
  const [mcpImportError, setMcpImportError] = useState('');

  useEffect(() => {
    setActiveDomainSubTab('basic');
    setDomainTestChatMessages([]);
    setDomainTestChatError('');
    setDomainTestChatResult(null);
    if (selectedDomain?.id) {
      domainTestChatSessionIdRef.current = createAdminPreviewSessionId(selectedDomain.id);
    } else {
      domainTestChatSessionIdRef.current = '';
    }
  }, [selectedDomain?.id]);
  const [chronicleDiscoverHost, setChronicleDiscoverHost] = useState('127.0.0.1');
  const [chronicleDiscoverApiPort, setChronicleDiscoverApiPort] = useState(8000);
  const [chronicleDiscoverTcpPort, setChronicleDiscoverTcpPort] = useState(8001);
  const [chronicleBusy, setChronicleBusy] = useState(false);
  const [chronicleError, setChronicleError] = useState('');

  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawlMaxPages, setCrawlMaxPages] = useState(10);
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState('');
  const [crawlSuccess, setCrawlSuccess] = useState('');

  const [knowledgeCrawlUrl, setKnowledgeCrawlUrl] = useState('');
  const [knowledgeCrawlName, setKnowledgeCrawlName] = useState('');
  const [knowledgeCrawlMaxPages, setKnowledgeCrawlMaxPages] = useState(10);
  const [knowledgeCrawlMcpServerId, setKnowledgeCrawlMcpServerId] = useState('');
  const [knowledgeAttachDomainId, setKnowledgeAttachDomainId] = useState('');
  const [knowledgeCrawling, setKnowledgeCrawling] = useState(false);
  const [knowledgeCrawlError, setKnowledgeCrawlError] = useState('');
  const [knowledgeCrawlSuccess, setKnowledgeCrawlSuccess] = useState('');
  const [selectedDomainPromptTemplateId, setSelectedDomainPromptTemplateId] = useState<string>(
    DOMAIN_PROMPT_TEMPLATES[0].id
  );

  const normalizeAllowedTools = (tools: string[] | undefined): string[] => {
    if (!Array.isArray(tools)) {
      return [];
    }

    return tools
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  };

  const validateAllowedTools = (tools: string[]): string => {
    const uniqueCount = new Set(tools).size;
    if (uniqueCount !== tools.length) {
      return 'Allowed Toolsに重複があります';
    }

    return '';
  };

  const applySearchAllowedToolsPreset = () => {
    if (!selectedMcpServer) {
      return;
    }

    const preset = ['search_web', 'web_search', 'search'];
    const current = normalizeAllowedTools(selectedMcpServer.aiRouting?.allowedTools);
    const next = Array.from(new Set([...current, ...preset]));

    setMcpAiAllowedToolInput('');
    setMcpAiAllowedToolsError(validateAllowedTools(next));
    setSelectedMcpServer({
      ...selectedMcpServer,
      aiRouting: {
        ...(selectedMcpServer.aiRouting || {
          enabled: false,
          provider: 'ollama',
          model: 'qwen2.5:7b',
          systemPrompt: '',
          temperature: 0.1,
          maxTokens: 240,
          confidenceThreshold: 0.55,
          allowedTools: [],
        }),
        allowedTools: next,
        fallbackTool:
          selectedMcpServer.aiRouting?.fallbackTool &&
          next.includes(selectedMcpServer.aiRouting.fallbackTool)
            ? selectedMcpServer.aiRouting.fallbackTool
            : undefined,
      },
    });
  };

  const applyPronunciationRules = (input: string, domainId?: string) => {
    const sortedRules = [...pronunciations]
      .filter((rule) => rule.enabled)
      .filter((rule) => !domainId || !rule.domainId || rule.domainId === domainId)
      .sort((a, b) => b.priority - a.priority);

    let output = input;
    for (const rule of sortedRules) {
      output = output.split(rule.from).join(rule.to);
    }

    return applyWanaKanaFallback(output, pronunciationSettings.wanaKanaEnabled);
  };

  const selectedDomainKnowledges = useMemo(() => {
    if (!selectedDomain) {
      return [] as Knowledge[];
    }

    return selectedDomain.knowledgeIds
      .map((knowledgeId) => knowledges.find((knowledge) => knowledge.id === knowledgeId))
      .filter((knowledge): knowledge is Knowledge => Boolean(knowledge));
  }, [selectedDomain, knowledges]);

  const composedDomainText = useMemo(() => {
    if (!selectedDomain) {
      return '';
    }

    const parts = [
      selectedDomain.baseSystemPrompt,
      selectedDomain.baseContext,
      ...selectedDomainKnowledges.flatMap((knowledge) => [knowledge.systemPrompt, knowledge.context]),
    ];

    return parts
      .map((part) => part || '')
      .filter((part) => part.trim().length > 0)
      .join('\n\n');
  }, [selectedDomain, selectedDomainKnowledges]);

  const memoryMetrics = useMemo(() => {
    const charCount = composedDomainText.length;
    const utf8Bytes = new TextEncoder().encode(composedDomainText).length;
    const estimatedTokenCount = estimateTokens(composedDomainText);

    const manualLimit = parseInt(manualContextLimitInput, 10);
    const selectedContextLimit =
      Number.isFinite(manualLimit) && manualLimit > 0
        ? manualLimit
        : runtimeModelInfo?.contextLength || 8192;

    const usageRate = selectedContextLimit > 0
      ? (estimatedTokenCount / selectedContextLimit) * 100
      : 0;

    const warningLevel = usageRate >= DANGER_LINE_PERCENT
      ? 'danger'
      : usageRate >= WARNING_LINE_PERCENT
        ? 'warning'
        : 'safe';

    return {
      charCount,
      utf8Bytes,
      estimatedTokenCount,
      contextLimit: selectedContextLimit,
      usageRate,
      warningLevel,
      usingManualLimit: Number.isFinite(manualLimit) && manualLimit > 0,
    };
  }, [composedDomainText, runtimeModelInfo, manualContextLimitInput]);

  const sharedLogEnabledDomains = useMemo(
    () => domains.filter((domain) => domain.sharedLogEnabled === true),
    [domains],
  );

  const effectiveSharedLogDomainId = useMemo(() => {
    if (sharedLogFilterDomainId === SHARED_LOG_ALL_DOMAINS) {
      return '';
    }

    if (sharedLogFilterDomainId) {
      return sharedLogFilterDomainId;
    }

    return selectedDomain?.sharedLogEnabled ? selectedDomain.id : '';
  }, [sharedLogFilterDomainId, selectedDomain?.id, selectedDomain?.sharedLogEnabled]);

  const effectiveSharedLogUserId = useMemo(() => {
    if (!sharedLogFilterUserId || sharedLogFilterUserId === SHARED_LOG_ALL_USERS) {
      return '';
    }

    return sharedLogFilterUserId;
  }, [sharedLogFilterUserId]);

  const effectiveSharedLogSessionId = useMemo(() => {
    if (!sharedLogFilterSessionId || sharedLogFilterSessionId === SHARED_LOG_ALL_SESSIONS) {
      return '';
    }

    return sharedLogFilterSessionId;
  }, [sharedLogFilterSessionId]);

  const sortedSharedLogs = useMemo(
    () => [...sharedLogs].sort((left, right) => right.createdAt - left.createdAt),
    [sharedLogs],
  );

  const loadAllData = async (token: string) => {
    const [domainsRes, knowledgesRes, chroniclesRes, pronunciationsRes, pronunciationSettingsRes, memoriesRes] = await Promise.all([
      fetch('/api/domains', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/knowledges', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/chronicles', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/pronunciations', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/pronunciations/settings', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/memories', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (domainsRes.ok) {
      const domainData = (await domainsRes.json()).map((domain: Domain) => normalizeAdminDomain(domain));
      setDomains(domainData);
      if (domainData.length > 0) {
        const storedDomainId = typeof window !== 'undefined'
          ? localStorage.getItem(SELECTED_DOMAIN_STORAGE_KEY)
          : null;
        const restoredDomain = storedDomainId
          ? domainData.find((domain: Domain) => domain.id === storedDomainId)
          : null;
        setSelectedDomain(restoredDomain || domainData[0]);
      }
    }

    if (knowledgesRes.ok) {
      const knowledgeData = await knowledgesRes.json();
      setKnowledges(knowledgeData);
      if (knowledgeData.length > 0) {
        setSelectedKnowledge(knowledgeData[0]);
      }
    }

    if (chroniclesRes.ok) {
      const chronicleData = await chroniclesRes.json();
      setChronicles(chronicleData);
      if (chronicleData.length > 0) {
        setSelectedChronicle(chronicleData[0]);
      }
    }

    if (pronunciationsRes.ok) {
      const pronunciationData = await pronunciationsRes.json();
      setPronunciations(pronunciationData);
      if (pronunciationData.length > 0) {
        setSelectedPronunciation(pronunciationData[0]);
      }
    }

    if (pronunciationSettingsRes.ok) {
      const settingsData = await pronunciationSettingsRes.json();
      setPronunciationSettings({
        wanaKanaEnabled: settingsData?.wanaKanaEnabled === true,
        updatedAt: typeof settingsData?.updatedAt === 'string' ? settingsData.updatedAt : undefined,
      });
    }

    if (memoriesRes.ok) {
      const memoriesData = await memoriesRes.json();
      setMemories(Array.isArray(memoriesData?.memories) ? memoriesData.memories : []);
    }

    if (
      handleUnauthorizedResponse(domainsRes.status) ||
      handleUnauthorizedResponse(knowledgesRes.status) ||
      handleUnauthorizedResponse(chroniclesRes.status) ||
      handleUnauthorizedResponse(pronunciationsRes.status) ||
      handleUnauthorizedResponse(pronunciationSettingsRes.status) ||
      handleUnauthorizedResponse(memoriesRes.status)
    ) {
      return;
    }
  };

  const loadMemories = async (token: string, chronicleId?: string) => {
    try {
      setLoadingMemories(true);
      const query = chronicleId 
        ? `?chronicleId=${encodeURIComponent(chronicleId)}&export=true` 
        : '?export=true';
      const memoriesRes = await fetch(`/api/memories${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (memoriesRes.ok) {
        const memoriesData = await memoriesRes.json();
        setMemories(Array.isArray(memoriesData?.memories) ? memoriesData.memories : []);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setLoadingMemories(false);
    }
  };

  const loadAdminLoginHistory = async (token: string) => {
    try {
      setAdminLoginHistoryLoading(true);
      setAdminLoginHistoryError('');
      const response = await fetch('/api/admin-login-history?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setAdminLoginHistoryError(payload?.error || 'ログイン履歴の取得に失敗しました');
        return;
      }

      const payload = await response.json();
      setAdminLoginHistory(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      console.error(err);
      setAdminLoginHistoryError('ログイン履歴の取得中にエラーが発生しました');
    } finally {
      setAdminLoginHistoryLoading(false);
    }
  };

  const handleToggleMemoryActive = async (memoryId: string | number, active: boolean) => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setUpdatingMemoryId(memoryId);
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memoryId,
          active,
          chronicleId: selectedChronicle?.id,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setMessage(error?.error || 'メモリー状態の更新に失敗しました');
        return;
      }

      await loadMemories(token, selectedChronicle?.id);
      setMessage(active ? 'メモリーを有効にしました' : 'メモリーを無効にしました');
    } catch (err) {
      console.error('Failed to update memory:', err);
      setMessage('メモリー状態の更新中にエラーが発生しました');
    } finally {
      setUpdatingMemoryId(null);
    }
  };

   const loadRuntimeModelInfo = async (token: string) => {
    try {
      setRuntimeInfoLoading(true);
      setRuntimeInfoError('');

      const res = await fetch('/api/runtime-model', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (handleUnauthorizedResponse(res.status)) {
        return;
      }

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setRuntimeInfoError(error?.error || 'モデル情報の取得に失敗しました');
        return;
      }

      const data = await res.json();
      setRuntimeModelInfo(data);
    } catch (err) {
      console.error('Failed to load runtime model info:', err);
      setRuntimeInfoError('モデル情報の取得中にエラーが発生しました');
    } finally {
      setRuntimeInfoLoading(false);
    }
  };

  const loadDomainSharedLogs = async (token: string, options?: { domainId?: string; userId?: string; sessionId?: string; limit?: number }) => {
    try {
      setSharedLogsLoading(true);
      setSharedLogsError('');

      const params = new URLSearchParams();
      if (options?.domainId) {
        params.set('domainId', options.domainId);
      }
      if (options?.userId) {
        params.set('userId', options.userId);
      }
      if (options?.sessionId) {
        params.set('sessionId', options.sessionId);
      }
      params.set('limit', String(options?.limit || sharedLogsLimit));

      const response = await fetch(`/api/domain-chat-history?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setSharedLogs([]);
        setSharedLogsTotal(0);
        setSharedLogsError(payload?.error || 'チャット履歴の取得に失敗しました');
        return;
      }

      setSharedLogs(Array.isArray(payload?.items) ? payload.items : []);
      setSharedLogsTotal(typeof payload?.totalCount === 'number' ? payload.totalCount : 0);
      setSharedLogAvailableUserIds(
        Array.isArray(payload?.availableUserIds)
          ? payload.availableUserIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
          : [],
      );
      setSharedLogAvailableSessionIds(
        Array.isArray(payload?.availableSessionIds)
          ? payload.availableSessionIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
          : [],
      );
      setExpandedSharedLogId(null);
    } catch (err) {
      console.error('Failed to load shared logs:', err);
      setSharedLogs([]);
      setSharedLogsTotal(0);
      setSharedLogAvailableUserIds([]);
      setSharedLogAvailableSessionIds([]);
      setSharedLogsError('チャット履歴の取得中にエラーが発生しました');
    } finally {
      setSharedLogsLoading(false);
    }
  };

  const loadAssetFiles = async (token: string, type: AssetType): Promise<AssetFile[]> => {
    const response = await fetch(`/api/assets?type=${type}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (handleUnauthorizedResponse(response.status)) {
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`Failed to load ${type} assets`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.files)) {
      return [];
    }

    return payload.files
      .filter((item: unknown): item is AssetFile => {
        return Boolean(
          item &&
          typeof item === 'object' &&
          'name' in item &&
          'url' in item &&
          typeof item.name === 'string' &&
          typeof item.url === 'string'
        );
      })
        .map((item: AssetFile) => ({ name: item.name, url: item.url }));
  };

  const loadAllAssets = async (token: string) => {
    try {
      const [vrm, bgimage] = await Promise.all([
        loadAssetFiles(token, 'vrm'),
        loadAssetFiles(token, 'bgimage'),
      ]);
      setVrmAssets(vrm);
      setBgImageAssets(bgimage);
    } catch (err) {
      console.error('Failed to load asset files:', err);
    }
  };

  const loadSbv2Models = async (token: string) => {
    try {
      setSbv2ModelsError('');

      const response = await fetch('/api/stylebertvits2-models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setSbv2Models([]);
        setSbv2ModelsError(payload?.error || 'SBV2モデル一覧の取得に失敗しました');
        return;
      }

      if (!Array.isArray(payload?.models)) {
        setSbv2Models([]);
        setSbv2ModelsError('SBV2モデル一覧の形式が不正です');
        return;
      }

      const normalized = payload.models
        .filter((item: unknown): item is Record<string, unknown> & { id: string } => {
          return Boolean(item && typeof item === 'object' && 'id' in item && typeof item.id === 'string');
        })
        .map((item: Record<string, unknown> & { id: string }) => ({
          id: String(item.id),
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : String(item.id),
          speakerNames: Array.isArray(item.speakerNames)
            ? item.speakerNames.filter((name: unknown) => typeof name === 'string')
            : [],
          speakerCount:
            typeof item.speakerCount === 'number' && Number.isFinite(item.speakerCount)
              ? item.speakerCount
              : Array.isArray(item.speakerNames)
                ? item.speakerNames.length
                : 0,
          isMultiSpeaker: Boolean(item.isMultiSpeaker),
        })) as Sbv2ModelOption[];

      setSbv2Models(normalized);
      if (typeof payload?.error === 'string' && payload.error) {
        setSbv2ModelsError(payload.error);
      }
    } catch (err) {
      console.error('Failed to load Style-Bert-VITS2 models:', err);
      setSbv2Models([]);
      setSbv2ModelsError('SBV2モデル一覧の取得中にエラーが発生しました');
    }
  };

  const loadPublicManagementSettings = async (token: string) => {
    try {
      const response = await fetch('/api/public-management', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      setPublicSettings({
        maxConcurrentSessions:
          typeof payload?.maxConcurrentSessions === 'number' && Number.isFinite(payload.maxConcurrentSessions)
            ? Math.max(0, Math.floor(payload.maxConcurrentSessions))
            : 0,
        chatRequestsPerUserPerMinute:
          typeof payload?.chatRequestsPerUserPerMinute === 'number' && Number.isFinite(payload.chatRequestsPerUserPerMinute)
            ? Math.max(0, Math.floor(payload.chatRequestsPerUserPerMinute))
            : 0,
        ttsRequestsPerUserPerMinute:
          typeof payload?.ttsRequestsPerUserPerMinute === 'number' && Number.isFinite(payload.ttsRequestsPerUserPerMinute)
            ? Math.max(0, Math.floor(payload.ttsRequestsPerUserPerMinute))
            : 0,
      });
    } catch (err) {
      console.error('Failed to load public management settings:', err);
    }
  };

  const loadMcpServers = async (token: string) => {
    try {
      setMcpServersError('');

      const response = await fetch('/api/mcp-servers', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMcpServers([]);
        setMcpServersError(payload?.error || 'MCPサーバー一覧の取得に失敗しました');
        return;
      }

      if (!Array.isArray(payload?.servers)) {
        setMcpServers([]);
        setMcpServersError('MCPサーバー一覧の形式が不正です');
        return;
      }

      const servers = payload.servers as MCPServer[];
      setMcpServers(servers);
      if (servers.length > 0 && !selectedMcpServer) {
        setSelectedMcpServer(servers[0]);
      }
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
      setMcpServers([]);
      setMcpServersError('MCPサーバー一覧の取得中にエラーが発生しました');
    }
  };

  const handleTestMcpConnection = async (serverId: string) => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setMcpTestBusy(serverId);

      const response = await fetch(`/api/mcp-servers/${serverId}/test`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json().catch(() => null);
      setMcpTestResults((prev) => ({
        ...prev,
        [serverId]: result || { success: false, message: '接続テスト結果の解析に失敗しました' },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '接続テスト中に予期しないエラーが発生しました';
      setMcpTestResults((prev) => ({
        ...prev,
        [serverId]: { success: false, message },
      }));
    } finally {
      setMcpTestBusy(null);
    }
  };

  const handleSaveMcpServer = async () => {
    if (!selectedMcpServer) {
      return;
    }

    if (mcpRuleRoutingJsonError) {
      setMessage('Rule Routing JSONの形式が不正です。修正してから保存してください');
      return;
    }

    if (mcpStdioArgsError) {
      setMessage('stdio引数(JSON配列)の形式が不正です。修正してから保存してください');
      return;
    }

    if (mcpAiAllowedToolsError) {
      setMessage('AI RoutingのAllowed Tools設定に不備があります。修正してから保存してください');
      return;
    }

    let serverToSave = selectedMcpServer;
    try {
      const parsedRules = JSON.parse(mcpRuleRoutingJsonInput || '[]');
      if (!Array.isArray(parsedRules)) {
        setMessage('Rule Routing JSONは配列形式で入力してください');
        return;
      }

      serverToSave = {
        ...selectedMcpServer,
        ruleRouting: {
          enabled: selectedMcpServer.ruleRouting?.enabled ?? true,
          rules: parsedRules,
        },
      };

      if (selectedMcpServer.transport === 'stdio') {
        const parsedArgs = JSON.parse(mcpStdioArgsInput || '[]');
        if (!Array.isArray(parsedArgs)) {
          setMessage('stdio引数はJSON配列形式で入力してください');
          return;
        }

        serverToSave = {
          ...serverToSave,
          config: {
            ...serverToSave.config,
            args: parsedArgs,
          },
        };
      }

      const aiRouting = serverToSave.aiRouting;
      if (aiRouting) {
        const normalizedAllowedTools = normalizeAllowedTools(aiRouting.allowedTools);
        const aiValidationError = validateAllowedTools(normalizedAllowedTools);
        if (aiValidationError) {
          setMessage(aiValidationError);
          return;
        }

        const normalizedFallback =
          typeof aiRouting.fallbackTool === 'string' && aiRouting.fallbackTool.trim()
            ? aiRouting.fallbackTool.trim()
            : undefined;

        if (normalizedFallback && !normalizedAllowedTools.includes(normalizedFallback)) {
          setMessage('Fallback ToolはAllowed Toolsから選択してください');
          return;
        }

        serverToSave = {
          ...serverToSave,
          aiRouting: {
            ...aiRouting,
            allowedTools: Array.from(new Set(normalizedAllowedTools)),
            fallbackTool: normalizedFallback,
          },
        };
      }
    } catch {
      setMessage('Rule Routing または stdio引数(JSON配列)の形式が不正です。修正してから保存してください');
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setSavingMcpServer(true);

      const response = await fetch(`/api/mcp-servers/${selectedMcpServer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(serverToSave),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMessage(payload?.error || 'MCPサーバーの保存に失敗しました');
        return;
      }

      const payload = await response.json();
      setSelectedMcpServer(payload.server);
      setMcpRuleRoutingJsonInput(JSON.stringify(payload.server?.ruleRouting?.rules || [], null, 2));
      setMcpRuleRoutingJsonError('');
      setMcpStdioArgsInput(JSON.stringify(payload.server?.config?.args || [], null, 0));
      setMcpStdioArgsError('');
      setMcpAiAllowedToolInput('');
      setMcpAiAllowedToolsError('');
      setMcpServers((prev) =>
        prev.map((s) => (s.id === selectedMcpServer.id ? payload.server : s))
      );
      setMessage('MCPサーバーを保存しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MCPサーバーの保存中にエラーが発生しました';
      setMessage(message);
    } finally {
      setSavingMcpServer(false);
    }
  };

  const handleGenerateMcpSystemPrompt = async () => {
    if (!selectedMcpServer) {
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setGeneratingMcpSystemPrompt(true);

      const response = await fetch(`/api/mcp-servers/${selectedMcpServer.id}/generate-system-prompt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.error || 'System Promptの自動生成に失敗しました');
        return;
      }

      setSelectedMcpServer(payload.server);
      setMcpServers((prev) => prev.map((server) => (server.id === payload.server.id ? payload.server : server)));
      setMessage('DB情報からSystem Promptを自動生成して保存しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'System Prompt生成中にエラーが発生しました';
      setMessage(message);
    } finally {
      setGeneratingMcpSystemPrompt(false);
    }
  };

  const handleDeleteMcpServer = async (serverId: string) => {
    const target = mcpServers.find((server) => server.id === serverId);
    if (target?.isPreset) {
      setMessage('デフォルトプリセットのMCPサーバーは削除できません');
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (!window.confirm('このMCPサーバーを削除してもよろしいですか？')) {
      return;
    }

    try {
      const response = await fetch(`/api/mcp-servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMessage(payload?.error || 'MCPサーバーの削除に失敗しました');
        return;
      }

      const nextServers = mcpServers.filter((s) => s.id !== serverId);
      setMcpServers(nextServers);
      if (selectedMcpServer?.id === serverId) {
        setSelectedMcpServer(nextServers[0] || null);
      }
      setMessage('MCPサーバーを削除しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MCPサーバーの削除中にエラーが発生しました';
      setMessage(message);
    }
  };

  const handleCrawlSite = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setCrawlError('認証情報が見つかりません。再ログインしてください');
      return;
    }
    if (!selectedDomain) {
      setCrawlError('ドメインを選択してください');
      return;
    }
    if (!crawlUrl.trim() || !crawlUrl.startsWith('http')) {
      setCrawlError('有効なURLを入力してください（http:// または https://）');
      return;
    }
    if (!Number.isFinite(crawlMaxPages) || crawlMaxPages < 1 || crawlMaxPages > 30) {
      setCrawlError('最大ページ数は1〜30で指定してください');
      return;
    }
    const mcpServerId = selectedDomain.mcpServerIds?.[0];
    if (!mcpServerId) {
      setCrawlError('このドメインにMCPサーバーが割り当てられていません');
      return;
    }

    setCrawling(true);
    setCrawlError('');
    setCrawlSuccess('');
    try {
      const res = await fetch(`/api/domains/${selectedDomain.id}/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: crawlUrl.trim(), mcpServerId, maxPages: crawlMaxPages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = typeof err?.details === 'string' && err.details.trim().length > 0
          ? ` (${err.details})`
          : '';
        setCrawlError((err?.error || '解析に失敗しました') + detail);
        return;
      }

      const payload = await res.json();
      setSelectedDomain(payload.domain);
      setDomains((prev: Domain[]) => prev.map((d: Domain) => (d.id === payload.domain.id ? payload.domain : d)));
      setCrawlSuccess(`解析完了: ${payload.crawlSummary.pageCount}ページ取得（上限 ${crawlMaxPages}） → ベースシステムプロンプトに保存しました`);
      setCrawlUrl('');
    } catch (err) {
      setCrawlError(err instanceof Error ? err.message : '解析中にエラーが発生しました');
    } finally {
      setCrawling(false);
    }
  };

  const handleCreateKnowledgeFromSite = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setKnowledgeCrawlError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (!knowledgeCrawlUrl.trim() || !knowledgeCrawlUrl.startsWith('http')) {
      setKnowledgeCrawlError('有効なURLを入力してください（http:// または https://）');
      return;
    }

    if (!Number.isFinite(knowledgeCrawlMaxPages) || knowledgeCrawlMaxPages < 1 || knowledgeCrawlMaxPages > 30) {
      setKnowledgeCrawlError('最大ページ数は1〜30で指定してください');
      return;
    }

    if (!knowledgeCrawlMcpServerId) {
      setKnowledgeCrawlError('MCPサーバーを選択してください');
      return;
    }

    setKnowledgeCrawling(true);
    setKnowledgeCrawlError('');
    setKnowledgeCrawlSuccess('');

    try {
      const res = await fetch('/api/knowledges/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: knowledgeCrawlUrl.trim(),
          mcpServerId: knowledgeCrawlMcpServerId,
          maxPages: knowledgeCrawlMaxPages,
          knowledgeName: knowledgeCrawlName.trim() || undefined,
          domainId: knowledgeAttachDomainId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = typeof err?.details === 'string' && err.details.trim().length > 0
          ? ` (${err.details})`
          : '';
        setKnowledgeCrawlError((err?.error || 'ナレッジ生成に失敗しました') + detail);
        return;
      }

      const payload = await res.json();
      setKnowledges((prev: Knowledge[]) => {
        const filtered = prev.filter((k: Knowledge) => k.id !== payload.knowledge.id);
        return [...filtered, payload.knowledge];
      });
      setSelectedKnowledge(payload.knowledge);

      if (payload.domain) {
        setDomains((prev: Domain[]) => prev.map((d: Domain) => (d.id === payload.domain.id ? payload.domain : d)));
        if (selectedDomain?.id === payload.domain.id) {
          setSelectedDomain(payload.domain);
        }
      }

      const attachedText = payload.domain ? ` / ドメイン「${payload.domain.name}」へアタッチ済み` : '';
      setKnowledgeCrawlSuccess(
        `ナレッジ作成完了: ${payload.knowledge.name} (${payload.crawlSummary.pageCount}ページ取得)${attachedText}`
      );
    } catch (err) {
      setKnowledgeCrawlError(err instanceof Error ? err.message : 'ナレッジ生成中にエラーが発生しました');
    } finally {
      setKnowledgeCrawling(false);
    }
  };

  const handleRefreshKnowledgeFromSite = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setKnowledgeCrawlError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (!selectedKnowledge) {
      setKnowledgeCrawlError('更新するナレッジを選択してください');
      return;
    }

    if (!knowledgeCrawlUrl.trim() || !knowledgeCrawlUrl.startsWith('http')) {
      setKnowledgeCrawlError('有効なURLを入力してください（http:// または https://）');
      return;
    }

    if (!Number.isFinite(knowledgeCrawlMaxPages) || knowledgeCrawlMaxPages < 1 || knowledgeCrawlMaxPages > 30) {
      setKnowledgeCrawlError('最大ページ数は1〜30で指定してください');
      return;
    }

    if (!knowledgeCrawlMcpServerId) {
      setKnowledgeCrawlError('MCPサーバーを選択してください');
      return;
    }

    setKnowledgeCrawling(true);
    setKnowledgeCrawlError('');
    setKnowledgeCrawlSuccess('');

    try {
      const res = await fetch('/api/knowledges/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: knowledgeCrawlUrl.trim(),
          mcpServerId: knowledgeCrawlMcpServerId,
          maxPages: knowledgeCrawlMaxPages,
          knowledgeName: knowledgeCrawlName.trim() || selectedKnowledge.name,
          knowledgeId: selectedKnowledge.id,
          domainId: knowledgeAttachDomainId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = typeof err?.details === 'string' && err.details.trim().length > 0
          ? ` (${err.details})`
          : '';
        setKnowledgeCrawlError((err?.error || 'ナレッジ更新に失敗しました') + detail);
        return;
      }

      const payload = await res.json();
      setKnowledges((prev: Knowledge[]) =>
        prev.map((k: Knowledge) => (k.id === payload.knowledge.id ? payload.knowledge : k))
      );
      setSelectedKnowledge(payload.knowledge);

      if (payload.domain) {
        setDomains((prev: Domain[]) => prev.map((d: Domain) => (d.id === payload.domain.id ? payload.domain : d)));
        if (selectedDomain?.id === payload.domain.id) {
          setSelectedDomain(payload.domain);
        }
      }

      const attachedText = payload.domain ? ` / ドメイン「${payload.domain.name}」へアタッチ済み` : '';
      setKnowledgeCrawlSuccess(
        `ナレッジ更新完了: ${payload.knowledge.name} (${payload.crawlSummary.pageCount}ページ取得)${attachedText}`
      );
    } catch (err) {
      setKnowledgeCrawlError(err instanceof Error ? err.message : 'ナレッジ更新中にエラーが発生しました');
    } finally {
      setKnowledgeCrawling(false);
    }
  };

  const applyDomainPromptTemplate = (mode: 'replace' | 'append') => {
    if (!selectedDomain) {
      setMessage('ドメインを選択してください');
      return;
    }

    const template = DOMAIN_PROMPT_TEMPLATES.find((item) => item.id === selectedDomainPromptTemplateId);
    if (!template) {
      setMessage('テンプレートが見つかりません');
      return;
    }

    const rendered = renderDomainPromptTemplate(template, selectedDomain);
    const nextPrompt =
      mode === 'append' && selectedDomain.baseSystemPrompt.trim().length > 0
        ? `${selectedDomain.baseSystemPrompt}\n\n${rendered}`
        : rendered;

    setSelectedDomain({
      ...selectedDomain,
      baseSystemPrompt: nextPrompt,
    });
    setMessage(`テンプレート「${template.label}」を${mode === 'append' ? '追記' : '上書き'}適用しました`);
  };

  useEffect(() => {
    if (!knowledgeCrawlMcpServerId) {
      const preferredId = selectedDomain?.mcpServerIds?.[0] || mcpServers[0]?.id || '';
      if (preferredId) {
        setKnowledgeCrawlMcpServerId(preferredId);
      }
    }

    if (!knowledgeAttachDomainId && selectedDomain?.id) {
      setKnowledgeAttachDomainId(selectedDomain.id);
    }
  }, [selectedDomain, mcpServers, knowledgeCrawlMcpServerId, knowledgeAttachDomainId]);

  const handleImportMcpServer = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMcpImportError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (!mcpImportUrl.trim()) {
      setMcpImportError('MCPサーバーURLを入力してください');
      return;
    }

    try {
      setMcpImporting(true);
      setMcpImportError('');

      const res = await fetch('/api/mcp-servers/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mcp_server_url: mcpImportUrl.trim(),
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setMcpImportError(error?.error || 'インポートに失敗しました');
        return;
      }

      const payload = await res.json();
      setMcpServers((prev) => {
        const filtered = prev.filter(s => s.name !== payload.server.name);
        return [...filtered, payload.server];
      });
      setSelectedMcpServer(payload.server);
      setMcpImportUrl('');
      setMessage('MCPサーバーをインポートしました');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'インポート中にエラーが発生しました';
      setMcpImportError(message);
    } finally {
      setMcpImporting(false);
    }
  };

  const handleUpdateMcpServerMetadata = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMcpImportError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (!selectedMcpServer || selectedMcpServer.transport !== 'sse' || !selectedMcpServer.config.url) {
      setMcpImportError('SSE接続可能なMCPサーバーを選択してください');
      return;
    }

    try {
      setMcpImporting(true);
      setMcpImportError('');

      const res = await fetch(`/api/mcp-servers/import/${selectedMcpServer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mcp_server_url: selectedMcpServer.config.url,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setMcpImportError(error?.error || '更新に失敗しました');
        return;
      }

      const payload = await res.json();
      setSelectedMcpServer(payload.server);
      setMcpServers((prev) =>
        prev.map((s) => (s.id === payload.server.id ? payload.server : s))
      );
      setMessage('MCPサーバー設定を更新しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新中にエラーが発生しました';
      setMcpImportError(message);
    } finally {
      setMcpImporting(false);
    }
  };

  const stopPreviewAudio = () => {
    if (sbv2PreviewAudioRef.current) {
      sbv2PreviewAudioRef.current.pause();
      sbv2PreviewAudioRef.current.currentTime = 0;
      sbv2PreviewAudioRef.current = null;
    }

    if (sbv2PreviewUrlRef.current) {
      URL.revokeObjectURL(sbv2PreviewUrlRef.current);
      sbv2PreviewUrlRef.current = null;
    }
  };

  const handleSavePublicSettings = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setSavingPublicSettings(true);

      const response = await fetch('/api/public-management', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          maxConcurrentSessions: Math.max(0, Math.floor(publicSettings.maxConcurrentSessions || 0)),
          chatRequestsPerUserPerMinute: Math.max(0, Math.floor(publicSettings.chatRequestsPerUserPerMinute || 0)),
          ttsRequestsPerUserPerMinute: Math.max(0, Math.floor(publicSettings.ttsRequestsPerUserPerMinute || 0)),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMessage(payload?.error || '公開管理設定の保存に失敗しました');
        return;
      }

      const payload = await response.json();
      setPublicSettings({
        maxConcurrentSessions:
          typeof payload?.maxConcurrentSessions === 'number'
            ? Math.max(0, Math.floor(payload.maxConcurrentSessions))
            : 0,
        chatRequestsPerUserPerMinute:
          typeof payload?.chatRequestsPerUserPerMinute === 'number'
            ? Math.max(0, Math.floor(payload.chatRequestsPerUserPerMinute))
            : 0,
        ttsRequestsPerUserPerMinute:
          typeof payload?.ttsRequestsPerUserPerMinute === 'number'
            ? Math.max(0, Math.floor(payload.ttsRequestsPerUserPerMinute))
            : 0,
      });
      setMessage('公開管理設定を保存しました');
    } catch {
      setMessage('公開管理設定の保存中にエラーが発生しました');
    } finally {
      setSavingPublicSettings(false);
    }
  };

  const loadCloudflareTunnelStatus = async (token: string) => {
    try {
      const response = await fetch('/api/public-management/tunnel', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setCloudflareTunnelStatus(null);
        setCloudflareTunnelError(payload?.error || 'Cloudflare Tunnel 状態の取得に失敗しました');
        return;
      }

      setCloudflareTunnelStatus(payload as CloudflareTunnelStatus);
      if (typeof payload?.targetUrl === 'string') {
        const matchedOption = tunnelTargetOptions.find((option) => option.url === payload.targetUrl);
        if (matchedOption) {
          setSelectedTunnelTargetId(matchedOption.id);
        }
      }
      setCloudflareTunnelError(
        typeof payload?.lastError === 'string' && payload.lastError ? payload.lastError : ''
      );
    } catch {
      setCloudflareTunnelStatus(null);
      setCloudflareTunnelError('Cloudflare Tunnel 状態の取得中にエラーが発生しました');
    }
  };

  const handleStartCloudflareTunnel = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setCloudflareTunnelBusy(true);
      setCloudflareTunnelError('');

      const response = await fetch('/api/public-management/tunnel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUrl: selectedTunnelTarget?.url,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setCloudflareTunnelError(payload?.error || 'Cloudflare Tunnel の起動に失敗しました');
        return;
      }

      setCloudflareTunnelStatus(payload as CloudflareTunnelStatus);
      setCloudflareTunnelError(
        typeof payload?.lastError === 'string' && payload.lastError ? payload.lastError : ''
      );
      setMessage(
        payload?.publicUrl
          ? `${selectedTunnelTarget?.label || '選択した公開先'} の Cloudflare Tunnel を起動しました`
          : `${selectedTunnelTarget?.label || '選択した公開先'} の Cloudflare Tunnel 起動を開始しました`
      );
    } catch {
      setCloudflareTunnelError('Cloudflare Tunnel の起動中にエラーが発生しました');
    } finally {
      setCloudflareTunnelBusy(false);
    }
  };

  const handleStopCloudflareTunnel = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setCloudflareTunnelBusy(true);
      setCloudflareTunnelError('');

      const response = await fetch('/api/public-management/tunnel', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setCloudflareTunnelError(payload?.error || 'Cloudflare Tunnel の停止に失敗しました');
        return;
      }

      setCloudflareTunnelStatus(payload as CloudflareTunnelStatus);
      setCloudflareTunnelError('');
      setMessage('Cloudflare Tunnel を停止しました');
    } catch {
      setCloudflareTunnelError('Cloudflare Tunnel の停止中にエラーが発生しました');
    } finally {
      setCloudflareTunnelBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'public') {
      setSessionStatus(null);
      setSessionStatusError('');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/public/sessions', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error('failed to fetch session status');
        }

        const data = (await res.json()) as SessionStatus;
        if (!cancelled) {
          setSessionStatus(data);
          setSessionStatusError('');
        }
      } catch {
        if (!cancelled) {
          setSessionStatusError('接続状況の取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          timer = setTimeout(fetchStatus, 3000);
        }
      }
    };

    fetchStatus();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'public') {
      setCloudflareTunnelError('');
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setCloudflareTunnelStatus(null);
      setCloudflareTunnelError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchTunnelStatus = async () => {
      await loadCloudflareTunnelStatus(token);
      if (!cancelled) {
        timer = setTimeout(fetchTunnelStatus, 5000);
      }
    };

    fetchTunnelStatus();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const token = localStorage.getItem('injection_token');
    if (!token || activeTab !== 'shared-log') {
      return;
    }

    loadDomainSharedLogs(token, {
      domainId: effectiveSharedLogDomainId || undefined,
      userId: effectiveSharedLogUserId || undefined,
      sessionId: effectiveSharedLogSessionId || undefined,
      limit: sharedLogsLimit,
    });
  }, [activeTab, effectiveSharedLogDomainId, effectiveSharedLogUserId, effectiveSharedLogSessionId, sharedLogsLimit]);

  useEffect(() => {
    if (sharedLogFilterDomainId === SHARED_LOG_ALL_DOMAINS || !sharedLogFilterDomainId) {
      return;
    }

    const exists = sharedLogEnabledDomains.some((domain) => domain.id === sharedLogFilterDomainId);
    if (!exists) {
      setSharedLogFilterDomainId('');
    }
  }, [sharedLogFilterDomainId, sharedLogEnabledDomains]);

  useEffect(() => {
    if (sharedLogFilterUserId === SHARED_LOG_ALL_USERS) {
      return;
    }

    const exists = sharedLogAvailableUserIds.includes(sharedLogFilterUserId);
    if (!exists) {
      setSharedLogFilterUserId(SHARED_LOG_ALL_USERS);
    }
  }, [sharedLogAvailableUserIds, sharedLogFilterUserId]);

  useEffect(() => {
    if (sharedLogFilterSessionId === SHARED_LOG_ALL_SESSIONS) {
      return;
    }

    const exists = sharedLogAvailableSessionIds.includes(sharedLogFilterSessionId);
    if (!exists) {
      setSharedLogFilterSessionId(SHARED_LOG_ALL_SESSIONS);
    }
  }, [sharedLogAvailableSessionIds, sharedLogFilterSessionId]);

  const handleTestPlaySbv2 = async () => {
    if (!selectedDomain) {
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    const text = sbv2TestText.trim();
    if (!text) {
      setSbv2TestError('テスト再生テキストを入力してください');
      return;
    }

    const modelId = (selectedDomain.stylebertvits2ModelId || '').trim() || '0';
    const style = (selectedDomain.stylebertvits2Style || '').trim() || 'Neutral';

    try {
      setSbv2TestBusy(true);
      setSbv2TestError('');
      stopPreviewAudio();

      const response = await fetch('/api/stylebertvits2-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, modelId, style }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setSbv2TestError(payload?.error || 'テスト再生に失敗しました');
        return;
      }

      const blob = await response.blob();
      if (!blob.size) {
        setSbv2TestError('再生可能な音声データが返却されませんでした');
        return;
      }

      const previewUrl = URL.createObjectURL(blob);
      sbv2PreviewUrlRef.current = previewUrl;

      const audio = new Audio(previewUrl);
      sbv2PreviewAudioRef.current = audio;

      audio.onended = () => {
        stopPreviewAudio();
      };

      audio.onerror = () => {
        setSbv2TestError('音声の再生に失敗しました');
        stopPreviewAudio();
      };

      await audio.play();
    } catch (err) {
      console.error('Failed to preview Style-Bert-VITS2 voice:', err);
      setSbv2TestError('テスト再生中にエラーが発生しました');
      stopPreviewAudio();
    } finally {
      setSbv2TestBusy(false);
    }
  };

  const handleSendDomainTestChat = async () => {
    if (!selectedDomain) {
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      redirectToLogin('ログインが必要です');
      return;
    }

    const userText = domainTestChatInput.trim();
    if (!userText) {
      setDomainTestChatError('テストメッセージを入力してください');
      return;
    }

    if (!domainTestChatSessionIdRef.current) {
      domainTestChatSessionIdRef.current = createAdminPreviewSessionId(selectedDomain.id);
    }

    const userMessage: DomainTestChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      createdAt: Date.now(),
    };
    const messageHistory = domainTestChatMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    try {
      setDomainTestChatBusy(true);
      setDomainTestChatError('');
      setDomainTestChatMessages((prev) => [...prev, userMessage]);
      setDomainTestChatInput('');

      const response = await fetch('/api/domain-test-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domainId: selectedDomain.id,
          draftDomain: selectedDomain,
          userText,
          sessionId: domainTestChatSessionIdRef.current,
          messageHistory,
        }),
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const payload = await response.json().catch(() => null) as
        | ({ assistantMessage?: string; error?: string } & DomainTestChatResult)
        | null;

      if (!response.ok) {
        setDomainTestChatError(payload?.error || 'テストチャットの実行に失敗しました');
        return;
      }

      const assistantMessage = typeof payload?.assistantMessage === 'string' ? payload.assistantMessage.trim() : '';
      if (!assistantMessage) {
        setDomainTestChatError('モデル応答が空でした');
        return;
      }

      setDomainTestChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantMessage,
          createdAt: Date.now(),
        },
      ]);
      setDomainTestChatResult({
        backend: payload?.backend,
        modelName: payload?.modelName,
        intercept: payload?.intercept,
      });
    } catch (err) {
      console.error('Failed to execute domain test chat:', err);
      setDomainTestChatError('テストチャット実行時にエラーが発生しました');
    } finally {
      setDomainTestChatBusy(false);
    }
  };

  const handleUploadAsset = async (type: AssetType, file: File | null) => {
    if (!file) {
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setUploadingAsset(type);
      setMessage('');

      const formData = new FormData();
      formData.append('type', type);
      formData.append('file', file);

      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.error || 'ファイルアップロードに失敗しました');
        return;
      }

      await loadAllAssets(token);

      const uploadedUrl = payload?.file?.url;
      if (selectedDomain && typeof uploadedUrl === 'string') {
        if (type === 'vrm') {
          setSelectedDomain({ ...selectedDomain, vrmUrl: uploadedUrl });
        } else {
          setSelectedDomain({ ...selectedDomain, bgUrl: uploadedUrl });
        }
      }

      setMessage(`${type === 'vrm' ? 'VRM' : '画像'}をアップロードしました`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('ファイルアップロード時にエラーが発生しました');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleDeleteAsset = async (type: AssetType, url: string | undefined) => {
    if (!url) {
      setMessage('削除するファイルを選択してください');
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (!window.confirm('選択中のファイルを削除しますか？')) {
      return;
    }

    try {
      setDeletingAsset(type);
      setMessage('');

      const response = await fetch('/api/assets', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type, url }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.error || 'ファイル削除に失敗しました');
        return;
      }

      await loadAllAssets(token);

      if (selectedDomain) {
        if (type === 'vrm' && selectedDomain.vrmUrl === url) {
          setSelectedDomain({ ...selectedDomain, vrmUrl: '' });
        }
        if (type === 'bgimage' && selectedDomain.bgUrl === url) {
          setSelectedDomain({ ...selectedDomain, bgUrl: '' });
        }
      }

      setMessage(`${type === 'vrm' ? 'VRM' : '画像'}を削除しました`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('ファイル削除時にエラーが発生しました');
    } finally {
      setDeletingAsset(null);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.setItem('injection_token', SESSION_AUTH_PLACEHOLDER);
  }, []);

  useEffect(() => {
    // 認証チェック
    const token = localStorage.getItem('injection_token');
    if (!token) {
      redirectToLogin('ログインが必要です');
      return;
    }

    // ドメイン一覧・ナレッジ一覧を取得
    const fetchData = async () => {
      try {
        await loadAllData(token);
        await loadRuntimeModelInfo(token);
        await loadAllAssets(token);
        await loadSbv2Models(token);
        await loadPublicManagementSettings(token);
        await loadAdminLoginHistory(token);
        await loadMcpServers(token);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('injection_token');
    if (!token || activeTab !== 'chronicle' || !selectedChronicle?.id) {
      return;
    }

    loadMemories(token, selectedChronicle.id);
  }, [activeTab, selectedChronicle?.id]);

  useEffect(() => {
    const storedManualContextLimit = localStorage.getItem('arki_manual_context_limit') || '';
    setManualContextLimitInput(storedManualContextLimit);
  }, []);

  useEffect(() => {
    localStorage.setItem('arki_manual_context_limit', manualContextLimitInput);
  }, [manualContextLimitInput]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (selectedDomain?.id) {
      localStorage.setItem(SELECTED_DOMAIN_STORAGE_KEY, selectedDomain.id);
    } else {
      localStorage.removeItem(SELECTED_DOMAIN_STORAGE_KEY);
    }
  }, [selectedDomain?.id]);

  useEffect(() => {
    return () => {
      stopPreviewAudio();
    };
  }, []);

  useEffect(() => {
    if (!selectedMcpServer) {
      setMcpRuleRoutingJsonInput('[]');
      setMcpRuleRoutingJsonError('');
      setMcpStdioArgsInput('[]');
      setMcpStdioArgsError('');
      setMcpAiAllowedToolInput('');
      setMcpAiAllowedToolsError('');
      return;
    }

    setMcpRuleRoutingJsonInput(JSON.stringify(selectedMcpServer.ruleRouting?.rules || [], null, 2));
    setMcpRuleRoutingJsonError('');
    setMcpStdioArgsInput(JSON.stringify(selectedMcpServer.config.args || []));
    setMcpStdioArgsError('');

    const normalizedTools = normalizeAllowedTools(selectedMcpServer.aiRouting?.allowedTools);
    setMcpAiAllowedToolInput('');
    setMcpAiAllowedToolsError(validateAllowedTools(normalizedTools));
  }, [selectedMcpServer?.id]);

  const handleSave = async () => {
    if (!selectedDomain) return;

    setSaving(true);
    setMessage('');

    try {
      const accessUsers = Array.isArray(selectedDomain.accessUsers) ? selectedDomain.accessUsers : [];
      const invalidAccessUser = accessUsers.find((user) => {
        const username = (user.username || '').trim();
        const hasStoredPassword = Boolean(user.passwordHash && user.passwordHash.trim().length > 0);
        const hasNewPassword = Boolean(user.password && user.password.trim().length > 0);
        return !username || (!hasStoredPassword && !hasNewPassword);
      });

      if ((selectedDomain.accessControlEnabled ?? false) && accessUsers.length === 0) {
        setMessage('アクセス制限を有効にする場合は、少なくとも1件のユーザーを登録してください');
        setSaving(false);
        return;
      }

      if (invalidAccessUser) {
        setMessage('アクセスユーザーはユーザー名必須です。新規追加時はパスワードも入力してください');
        setSaving(false);
        return;
      }

      const token = localStorage.getItem('injection_token');
      const res = await fetch(`/api/domains/${selectedDomain.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(selectedDomain),
      });

      if (res.ok) {
        const updatedDomain = normalizeAdminDomain(await res.json());
        setDomains((prev) => prev.map((domain) => (domain.id === updatedDomain.id ? updatedDomain : domain)));
        setSelectedDomain(updatedDomain);
        setMessage('保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json().catch(() => null);
        setMessage(error?.error || '保存に失敗しました');
      }
    } catch (err) {
      setMessage('エラーが発生しました');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDomain = async () => {
    const input = window.prompt('新しいドメイン名を入力してください');
    if (!input || input.trim() === '') {
      return;
    }

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: input.trim() }),
      });

      if (res.ok) {
        const created = normalizeAdminDomain(await res.json());
        setDomains((prev) => [...prev, created]);
        setSelectedDomain(created);
        setMessage('ドメインを追加しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || 'ドメイン追加に失敗しました');
      }
    } catch {
      setMessage('ドメイン追加時にエラーが発生しました');
    }
  };

  const handleDeleteDomain = async () => {
    if (!selectedDomain) {
      return;
    }

    if (!window.confirm(`ドメイン「${selectedDomain.name}」を削除しますか？`)) {
      return;
    }

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch(`/api/domains/${selectedDomain.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const nextDomains = domains.filter((domain) => domain.id !== selectedDomain.id);
        setDomains(nextDomains);
        setSelectedDomain(nextDomains[0] || null);
        setMessage('ドメインを削除しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || 'ドメイン削除に失敗しました');
      }
    } catch {
      setMessage('ドメイン削除時にエラーが発生しました');
    }
  };

  const handleSaveKnowledge = async () => {
    if (!selectedKnowledge) return;

    setSavingKnowledge(true);
    setMessage('');

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch(`/api/knowledges/${selectedKnowledge.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(selectedKnowledge),
      });

      if (res.ok) {
        const updated = await res.json();
        setKnowledges((prev) => prev.map((knowledge) => (knowledge.id === updated.id ? updated : knowledge)));
        setSelectedKnowledge(updated);
        setMessage('ナレッジを保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('ナレッジ保存に失敗しました');
      }
    } catch (err) {
      setMessage('エラーが発生しました');
      console.error(err);
    } finally {
      setSavingKnowledge(false);
    }
  };

  const handleCreateKnowledge = async () => {
    const input = window.prompt('新しいナレッジ名を入力してください');
    if (!input || input.trim() === '') {
      return;
    }

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch('/api/knowledges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: input.trim() }),
      });

      if (res.ok) {
        const created = await res.json();
        setKnowledges((prev) => [...prev, created]);
        setSelectedKnowledge(created);
        setMessage('ナレッジを追加しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || 'ナレッジ追加に失敗しました');
      }
    } catch {
      setMessage('ナレッジ追加時にエラーが発生しました');
    }
  };

  const handleDeleteKnowledge = async () => {
    if (!selectedKnowledge) {
      return;
    }

    if (!window.confirm(`ナレッジ「${selectedKnowledge.name}」を削除しますか？`)) {
      return;
    }

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch(`/api/knowledges/${selectedKnowledge.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const nextKnowledges = knowledges.filter((knowledge) => knowledge.id !== selectedKnowledge.id);
        setKnowledges(nextKnowledges);
        setSelectedKnowledge(nextKnowledges[0] || null);
        setMessage('ナレッジを削除しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || 'ナレッジ削除に失敗しました');
      }
    } catch (err) {
      setMessage('ナレッジ削除時にエラーが発生しました');
      console.error(err);
    }
  };

  const handleCreatePronunciation = async () => {
    const from = window.prompt('変換前の文字列（例: Ark-i）を入力してください');
    if (!from || from.trim() === '') {
      return;
    }

    const to = window.prompt('変換後の読み（例: アークインジェクション）を入力してください');
    if (!to || to.trim() === '') {
      return;
    }

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch('/api/pronunciations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          from: from.trim(),
          to: to.trim(),
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setPronunciations((prev) => [...prev, created].sort((a, b) => b.priority - a.priority));
        setSelectedPronunciation(created);
        setMessage('発音辞書を追加しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || '発音辞書追加に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setMessage('発音辞書追加時にエラーが発生しました');
    }
  };

  const handleSavePronunciation = async () => {
    if (!selectedPronunciation) {
      return;
    }

    setSavingPronunciation(true);
    setMessage('');

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch(`/api/pronunciations/${selectedPronunciation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(selectedPronunciation),
      });

      if (res.ok) {
        const updated = await res.json();
        setPronunciations((prev) =>
          prev
            .map((rule) => (rule.id === updated.id ? updated : rule))
            .sort((a, b) => b.priority - a.priority)
        );
        setSelectedPronunciation(updated);
        setMessage('発音辞書を保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || '発音辞書保存に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setMessage('発音辞書保存時にエラーが発生しました');
    } finally {
      setSavingPronunciation(false);
    }
  };

  const handleDeletePronunciation = async () => {
    if (!selectedPronunciation) {
      return;
    }

    if (!window.confirm(`発音辞書「${selectedPronunciation.from} → ${selectedPronunciation.to}」を削除しますか？`)) {
      return;
    }

    try {
      const token = localStorage.getItem('injection_token');
      const res = await fetch(`/api/pronunciations/${selectedPronunciation.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const nextRules = pronunciations.filter((rule) => rule.id !== selectedPronunciation.id);
        setPronunciations(nextRules);
        setSelectedPronunciation(nextRules[0] || null);
        setMessage('発音辞書を削除しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || '発音辞書削除に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setMessage('発音辞書削除時にエラーが発生しました');
    }
  };

  const handleSavePronunciationSettings = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setSavingPronunciationSettings(true);
      setMessage('');

      const res = await fetch('/api/pronunciations/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          wanaKanaEnabled: pronunciationSettings.wanaKanaEnabled,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setPronunciationSettings({
          wanaKanaEnabled: updated?.wanaKanaEnabled === true,
          updatedAt: typeof updated?.updatedAt === 'string' ? updated.updatedAt : undefined,
        });
        setMessage('発音辞書設定を保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json().catch(() => null);
        setMessage(error?.error || '発音辞書設定の保存に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setMessage('発音辞書設定の保存時にエラーが発生しました');
    } finally {
      setSavingPronunciationSettings(false);
    }
  };

  const handlePreviewPronunciation = () => {
    const output = applyPronunciationRules(
      pronunciationTestInput,
      pronunciationTestDomainId || undefined
    );
    setPronunciationTestOutput(output);
  };

  const toggleDomainKnowledge = (knowledgeId: string) => {
    if (!selectedDomain) return;

    const exists = selectedDomain.knowledgeIds.includes(knowledgeId);
    const knowledgeIds = exists
      ? selectedDomain.knowledgeIds.filter((id) => id !== knowledgeId)
      : [...selectedDomain.knowledgeIds, knowledgeId];

    setSelectedDomain({ ...selectedDomain, knowledgeIds });
  };

  const toggleDomainChronicle = (chronicleId: string) => {
    if (!selectedDomain) return;

    const current = selectedDomain.chronicleIds || [];
    const exists = current.includes(chronicleId);
    const chronicleIds = exists
      ? current.filter((id) => id !== chronicleId)
      : [...current, chronicleId];

    setSelectedDomain({ ...selectedDomain, chronicleIds });
  };

  const toggleDomainMemory = (memoryId: string | number) => {
    if (!selectedDomain) return;

    const current = selectedDomain.memoryIds || [];
    const memoryIdStr = String(memoryId);
    const exists = current.includes(memoryIdStr);
    const memoryIds = exists
      ? current.filter((id) => id !== memoryIdStr)
      : [...current, memoryIdStr];

    setSelectedDomain({ ...selectedDomain, memoryIds });
  };

  const handleCreateChronicle = async () => {
    const input = window.prompt('新しいCHRONICLE名を入力してください');
    if (!input || input.trim() === '') {
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setChronicleBusy(true);
      setChronicleError('');
      const res = await fetch('/api/chronicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: input.trim(),
          description: '',
          host: chronicleDiscoverHost,
          apiPort: chronicleDiscoverApiPort,
          tcpPort: chronicleDiscoverTcpPort,
          enabled: true,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setChronicleError(error?.error || 'CHRONICLE追加に失敗しました');
        return;
      }

      const created = await res.json();
      setChronicles((prev) => [...prev, created]);
      setSelectedChronicle(created);
      setMessage('CHRONICLEを追加しました');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setChronicleError('CHRONICLE追加時にエラーが発生しました');
    } finally {
      setChronicleBusy(false);
    }
  };

  const handleSaveChronicle = async () => {
    if (!selectedChronicle) {
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setChronicleBusy(true);
      setChronicleError('');

      const res = await fetch(`/api/chronicles/${selectedChronicle.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(selectedChronicle),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setChronicleError(error?.error || 'CHRONICLE保存に失敗しました');
        return;
      }

      const updated = await res.json();
      setChronicles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedChronicle(updated);
      setMessage('CHRONICLEを保存しました');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setChronicleError('CHRONICLE保存時にエラーが発生しました');
    } finally {
      setChronicleBusy(false);
    }
  };

  const handleDeleteChronicle = async () => {
    if (!selectedChronicle) {
      return;
    }

    if (!window.confirm(`CHRONICLE「${selectedChronicle.name}」を削除しますか？`)) {
      return;
    }

    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setChronicleBusy(true);
      setChronicleError('');

      const res = await fetch(`/api/chronicles/${selectedChronicle.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setChronicleError(error?.error || 'CHRONICLE削除に失敗しました');
        return;
      }

      const next = chronicles.filter((item) => item.id !== selectedChronicle.id);
      setChronicles(next);
      setSelectedChronicle(next[0] || null);
      setMessage('CHRONICLEを削除しました');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setChronicleError('CHRONICLE削除時にエラーが発生しました');
    } finally {
      setChronicleBusy(false);
    }
  };

  const handleDiscoverChronicle = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setMessage('認証情報が見つかりません。再ログインしてください');
      return;
    }

    try {
      setChronicleBusy(true);
      setChronicleError('');

      const res = await fetch('/api/chronicles/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: selectedChronicle?.name || '',
          description: selectedChronicle?.description || '',
          host: chronicleDiscoverHost,
          apiPort: chronicleDiscoverApiPort,
          tcpPort: chronicleDiscoverTcpPort,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.chronicle) {
        setChronicleError(payload?.error || 'CHRONICLE検出に失敗しました');
        return;
      }

      const chronicle = payload.chronicle as Chronicle;
      setChronicles((prev) => {
        const exists = prev.some((item) => item.id === chronicle.id);
        return exists
          ? prev.map((item) => (item.id === chronicle.id ? chronicle : item))
          : [...prev, chronicle];
      });
      setSelectedChronicle(chronicle);
      const modelName = payload?.discovery?.defaultModelName;
      setMessage(
        typeof modelName === 'string' && modelName.trim()
          ? `CHRONICLEを検出・登録しました（モデル: ${modelName}）`
          : 'CHRONICLEを検出・登録しました'
      );
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setChronicleError('CHRONICLE検出時にエラーが発生しました');
    } finally {
      setChronicleBusy(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      setBackupBusy(true);
      setMessage('');
      const token = localStorage.getItem('injection_token');
      const res = await fetch('/api/backup', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const error = await res.json();
        setMessage(error.error || 'バックアップ保存に失敗しました');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `arki-full-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage('フルバックアップを保存しました');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('バックアップ保存時にエラーが発生しました');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDownloadSharedLogs = async () => {
    if (!selectedDomain?.id) {
      setMessage('保存対象のドメインが選択されていません');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      setSharedLogDownloadBusy(true);
      setMessage('');
      const token = localStorage.getItem('injection_token');
      if (!token) {
        setMessage('認証情報が見つかりません。再ログインしてください');
        setTimeout(() => setMessage(''), 3000);
        return;
      }

      const params = new URLSearchParams();
      params.set('domainId', selectedDomain.id);
      params.set('all', 'true');

      const response = await fetch(`/api/domain-chat-history?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.error || '共有ログの保存に失敗しました');
        setTimeout(() => setMessage(''), 3000);
        return;
      }

      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length === 0) {
        setMessage('選択中ドメインに保存対象の共有ログがありません');
        setTimeout(() => setMessage(''), 3000);
        return;
      }

      const domainLabel = selectedDomain.name || selectedDomain.id;
      const timestamp = createDownloadTimestamp();
      const fileName = [
        'arki-shared-logs',
        sanitizeDownloadLabel(domainLabel),
        'all-logs',
        timestamp,
      ]
        .filter(Boolean)
        .join('-');

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        filters: {
          domainId: selectedDomain.id,
          domainName: selectedDomain.name || null,
          userId: null,
          sessionId: null,
          allLogsForSelectedDomain: true,
          limit: null,
          loadedCount: items.length,
          totalCount: typeof payload?.totalCount === 'number' ? payload.totalCount : items.length,
        },
        items,
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage(`選択中ドメインの共有ログを ${items.length} 件保存しました`);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Shared log download error:', error);
      setMessage('共有ログの保存時にエラーが発生しました');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSharedLogDownloadBusy(false);
    }
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!window.confirm('現在のドメイン/ナレッジをバックアップ内容で置き換えます。実行しますか？')) {
      return;
    }

    try {
      setBackupBusy(true);
      setMessage('');
      const token = localStorage.getItem('injection_token');
      const text = await file.text();
      const payload = JSON.parse(text);

      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        setMessage(error.error || 'バックアップ読込に失敗しました');
        return;
      }

      if (token) {
        await loadAllData(token);
        await loadAllAssets(token);
      }
      setMessage('フルバックアップを読み込みました');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('バックアップ読込時にエラーが発生しました（JSON形式を確認してください）');
    } finally {
      setBackupBusy(false);
    }
  };

  const isMcpSaveBlockedByAiAllowedTools = false;

  if (authRedirecting) {
    return <div style={{ padding: '20px' }}>セッション切れのためログイン画面へ移動中...</div>;
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>読み込み中...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '30px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
        <h1 style={{ margin: '0 0 10px 0' }}>管理画面</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveTab('domain')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'domain' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'domain' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'domain' ? 'bold' : 'normal',
              }}
            >
              ドメイン管理
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('knowledge')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'knowledge' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'knowledge' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'knowledge' ? 'bold' : 'normal',
              }}
            >
              ナレッジ管理
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('chronicle')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'chronicle' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'chronicle' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'chronicle' ? 'bold' : 'normal',
              }}
            >
              CHRONICLE管理
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pronunciation')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'pronunciation' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'pronunciation' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'pronunciation' ? 'bold' : 'normal',
              }}
            >
              発音辞書
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('asset')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'asset' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'asset' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'asset' ? 'bold' : 'normal',
              }}
            >
              アセット管理
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('mcp')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'mcp' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'mcp' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'mcp' ? 'bold' : 'normal',
              }}
            >
              MCP管理
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('public')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'public' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'public' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'public' ? 'bold' : 'normal',
              }}
            >
              公開管理
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('shared-log')}
              style={{
                padding: '8px 14px',
                backgroundColor: activeTab === 'shared-log' ? '#0066cc' : '#f0f0f0',
                color: activeTab === 'shared-log' ? 'white' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: activeTab === 'shared-log' ? 'bold' : 'normal',
              }}
            >
              共有ログ
            </button>

            <button
              type="button"
              onClick={handleExportBackup}
              disabled={backupBusy}
              style={{
                padding: '8px 14px',
                backgroundColor: backupBusy ? '#ccc' : '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: backupBusy ? 'default' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              バックアップ保存
            </button>

            <label
              style={{
                padding: '8px 14px',
                backgroundColor: backupBusy ? '#ccc' : '#8b5cf6',
                color: 'white',
                borderRadius: '4px',
                cursor: backupBusy ? 'default' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              バックアップ読込
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleImportBackup}
                disabled={backupBusy}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {message && (
          <div
            style={{
              marginTop: '10px',
              padding: '10px',
              backgroundColor: message.includes('失敗') || message.includes('エラー') ? '#ffebee' : '#e8f5e9',
              color: message.includes('失敗') || message.includes('エラー') ? '#c62828' : '#2e7d32',
              borderRadius: '4px',
            }}
          >
            {message}
          </div>
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '20px' }}>
        {activeTab === 'domain' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>ドメイン一覧</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleCreateDomain}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ＋追加
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDomain}
                  disabled={!selectedDomain}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: !selectedDomain ? '#ccc' : '#ef5350',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: !selectedDomain ? 'default' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  削除
                </button>
              </div>
              {domains.length === 0 ? (
                <p>ドメインがありません</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {domains.map((domain) => (
                    <li key={domain.id} style={{ marginBottom: '10px' }}>
                      <button
                        onClick={() => setSelectedDomain(domain)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          backgroundColor: selectedDomain?.id === domain.id ? '#0066cc' : '#f0f0f0',
                          color: selectedDomain?.id === domain.id ? 'white' : '#000',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span>{domain.name}</span>
                          {domain.enabled === false && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '9999px',
                                backgroundColor: selectedDomain?.id === domain.id ? 'rgba(255,255,255,0.2)' : '#d1d5db',
                                color: selectedDomain?.id === domain.id ? '#fff' : '#374151',
                              }}
                            >
                              無効
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <main>
              {selectedDomain ? (
                <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <h2>{selectedDomain.name}</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                {domainSubTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveDomainSubTab(tab.id)}
                    style={{
                      padding: '10px 14px',
                      border: activeDomainSubTab === tab.id ? '1px solid #2563eb' : '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: activeDomainSubTab === tab.id ? '#eff6ff' : '#fff',
                      color: activeDomainSubTab === tab.id ? '#1d4ed8' : '#374151',
                      cursor: 'pointer',
                      textAlign: 'left',
                      minWidth: '180px',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{tab.label}</div>
                    <div style={{ fontSize: '12px', color: activeDomainSubTab === tab.id ? '#2563eb' : '#6b7280' }}>
                      {tab.description}
                    </div>
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
              >
                {activeDomainSubTab === 'basic' && (
                  <>
                <div style={{ marginBottom: '15px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 'bold',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDomain.enabled ?? true}
                      onChange={(e) =>
                        setSelectedDomain({ ...selectedDomain, enabled: e.target.checked })
                      }
                    />
                    クライアントで選択可能にする
                  </label>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                    OFFにするとドメインデータは保持したまま、クライアントの選択候補から除外されます。
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 'bold',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDomain.sharedLogEnabled ?? false}
                      onChange={(e) =>
                        setSelectedDomain({ ...selectedDomain, sharedLogEnabled: e.target.checked })
                      }
                    />
                    ログ共有をサーバー側でも記録する
                  </label>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                    ON の場合、このドメインの intercept リクエスト内容を injection-tool の SQLite に保存します。
                  </div>
                </div>

                <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fff' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 'bold',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDomain.accessControlEnabled ?? false}
                      onChange={(e) =>
                        setSelectedDomain({ ...selectedDomain, accessControlEnabled: e.target.checked })
                      }
                    />
                    ドメインアクセス制限を有効にする
                  </label>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                    ON の場合、Amica 側でこのドメインを選択したときにユーザー認証が必要になります。
                  </div>

                  <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                    {(selectedDomain.accessUsers || []).map((user, index) => (
                      <div
                        key={user.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
                          gap: '8px',
                          alignItems: 'end',
                          padding: '10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          backgroundColor: '#f8fafc',
                        }}
                      >
                        <div>
                          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
                            ユーザー名
                          </label>
                          <input
                            type="text"
                            value={user.username}
                            onChange={(e) => {
                              const nextUsers = [...(selectedDomain.accessUsers || [])];
                              nextUsers[index] = { ...nextUsers[index], username: e.target.value };
                              setSelectedDomain({ ...selectedDomain, accessUsers: nextUsers });
                            }}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
                            パスワード
                          </label>
                          <input
                            type="password"
                            value={user.password || ''}
                            onChange={(e) => {
                              const nextUsers = [...(selectedDomain.accessUsers || [])];
                              nextUsers[index] = { ...nextUsers[index], password: e.target.value };
                              setSelectedDomain({ ...selectedDomain, accessUsers: nextUsers });
                            }}
                            placeholder={user.passwordHash ? '変更時のみ入力' : '新規パスワードを入力'}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextUsers = (selectedDomain.accessUsers || []).filter((item) => item.id !== user.id);
                            setSelectedDomain({ ...selectedDomain, accessUsers: nextUsers });
                          }}
                          style={{
                            padding: '8px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          削除
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const nextUsers = [...(selectedDomain.accessUsers || [])];
                        nextUsers.push({
                          id: `access_user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                          username: '',
                          password: '',
                          passwordHash: '',
                          updatedAt: new Date().toISOString(),
                        });
                        setSelectedDomain({ ...selectedDomain, accessUsers: nextUsers, accessControlEnabled: true });
                      }}
                      style={{
                        justifySelf: 'start',
                        padding: '8px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      ユーザー追加
                    </button>

                    <div style={{ fontSize: '12px', color: '#666' }}>
                      既存ユーザーのパスワードは空欄のまま保存すると維持されます。新規ユーザー追加時はユーザー名とパスワードの両方を入力してください。
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    ドメイン名
                  </label>
                  <input
                    type="text"
                    value={selectedDomain.name}
                    onChange={(e) =>
                      setSelectedDomain({ ...selectedDomain, name: e.target.value })
                    }
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    説明
                  </label>
                  <textarea
                    value={selectedDomain.description}
                    onChange={(e) =>
                      setSelectedDomain({ ...selectedDomain, description: e.target.value })
                    }
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    キャッシュ有効期限（秒）
                  </label>
                  <input
                    type="number"
                    value={selectedDomain.ttl}
                    onChange={(e) =>
                      setSelectedDomain({ ...selectedDomain, ttl: parseInt(e.target.value) })
                    }
                    style={{
                      width: '200px',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    }}
                  />
                </div>
                  </>
                )}

                {activeDomainSubTab === 'prompt' && (
                  <>
                {showDomainSiteAnalysis && (
                <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #c8e6c9', borderRadius: '6px', backgroundColor: '#f0fff0' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>サイト解析 → プロンプト自動生成</div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="url"
                      value={crawlUrl}
                      onChange={(e) => { setCrawlUrl(e.target.value); setCrawlError(''); setCrawlSuccess(''); }}
                      placeholder="https://example.com"
                      disabled={crawling}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    />
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      value={crawlMaxPages}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(n)) {
                          setCrawlMaxPages(n);
                        } else {
                          setCrawlMaxPages(1);
                        }
                        setCrawlError('');
                        setCrawlSuccess('');
                      }}
                      disabled={crawling}
                      title="最大ページ数 (1-30)"
                      style={{
                        width: '120px',
                        padding: '6px 10px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    />
                    <button
                      onClick={handleCrawlSite}
                      disabled={crawling || !crawlUrl.trim()}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: crawling ? '#aaa' : '#388e3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: crawling ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {crawling ? '解析中...' : 'サイト解析'}
                    </button>
                  </div>
                  {crawlError && <div style={{ color: '#c62828', fontSize: '13px' }}>{crawlError}</div>}
                  {crawlSuccess && <div style={{ color: '#2e7d32', fontSize: '13px' }}>{crawlSuccess}</div>}
                  <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                    URLと最大ページ数（1〜30）を指定してサイトをクロールし、ベースシステムプロンプトを自動生成・保存します（既存の内容は上書きされます）
                  </div>
                </div>
                )}

                <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #bbdefb', borderRadius: '6px', backgroundColor: '#f5fbff' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>システムプロンプト テンプレート</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={selectedDomainPromptTemplateId}
                      onChange={(e) => setSelectedDomainPromptTemplateId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    >
                      {DOMAIN_PROMPT_TEMPLATES.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => applyDomainPromptTemplate('replace')}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      上書き適用
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDomainPromptTemplate('append')}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#0288d1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      追記適用
                    </button>
                  </div>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: '6px' }}>
                    {DOMAIN_PROMPT_TEMPLATES.find((item) => item.id === selectedDomainPromptTemplateId)?.description}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    ベースシステムプロンプト
                  </label>
                  <textarea
                    value={selectedDomain.baseSystemPrompt}
                    onChange={(e) =>
                      setSelectedDomain({ ...selectedDomain, baseSystemPrompt: e.target.value })
                    }
                    rows={5}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    ベースコンテキスト
                  </label>
                  <textarea
                    value={selectedDomain.baseContext}
                    onChange={(e) =>
                      setSelectedDomain({ ...selectedDomain, baseContext: e.target.value })
                    }
                    rows={5}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
                  </>
                )}

                {activeDomainSubTab === 'experience' && (
                  <>
                <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fafafa' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>クライアント アセット/TTS 上書き（ドメイン別）</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        キャラクター名
                      </label>
                      <input
                        type="text"
                        value={selectedDomain.characterName || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, characterName: e.target.value })
                        }
                        placeholder="空欄なら クライアント側の既定名を使用"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        テーマカラー
                      </label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(selectedDomain.themeColor || '') ? selectedDomain.themeColor || '#f472b6' : '#f472b6'}
                          onChange={(e) =>
                            setSelectedDomain({ ...selectedDomain, themeColor: e.target.value })
                          }
                          style={{ width: '52px', height: '40px', padding: '4px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fff' }}
                        />
                        <input
                          type="text"
                          value={selectedDomain.themeColor || ''}
                          onChange={(e) =>
                            setSelectedDomain({ ...selectedDomain, themeColor: e.target.value.trim() })
                          }
                          placeholder="空欄なら既定色を使用 (#f472b6 など)"
                          style={{
                            flex: 1,
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedDomain({ ...selectedDomain, themeColor: '' })}
                          style={{
                            padding: '8px 10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          既定色
                        </button>
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                        チャット名と入力ボタンのアクセント色に使われます。
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        背景画像 URL
                      </label>
                      <input
                        type="text"
                        value={selectedDomain.bgUrl || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, bgUrl: e.target.value })
                        }
                        placeholder="空欄なら クライアント側の既定背景を使用"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                        }}
                      />

                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                        <select
                          value={selectedDomain.bgUrl || ''}
                          onChange={(e) =>
                            setSelectedDomain({ ...selectedDomain, bgUrl: e.target.value })
                          }
                          style={{
                            flex: 1,
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: 'white',
                          }}
                        >
                          <option value="">アップロード済み背景から選択</option>
                          {bgImageAssets.map((asset) => (
                            <option key={asset.url} value={asset.url}>
                              {asset.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px',
                        fontWeight: 'bold',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDomain.vrmEnabled ?? true}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, vrmEnabled: e.target.checked })
                        }
                      />
                      VRMを優先表示する
                    </label>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      ON: VRM表示 / OFF: 2Dアバター表示
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      VRM URL
                    </label>
                    <input
                      type="text"
                      value={selectedDomain.vrmUrl || ''}
                      onChange={(e) =>
                        setSelectedDomain({ ...selectedDomain, vrmUrl: e.target.value })
                      }
                      placeholder="空欄なら クライアント側の既定VRMを使用"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                      }}
                    />

                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                      <select
                        value={selectedDomain.vrmUrl || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, vrmUrl: e.target.value })
                        }
                        style={{
                          flex: 1,
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                        }}
                      >
                        <option value="">アップロード済みVRMから選択</option>
                        {vrmAssets.map((asset) => (
                          <option key={asset.url} value={asset.url}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      2Dアバター - 待機時画像URL
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        value={selectedDomain.imageAvatarIdleUrl || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, imageAvatarIdleUrl: e.target.value })
                        }
                        placeholder="待機時の画像URL"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                        }}
                      />
                      <select
                        value={selectedDomain.imageAvatarIdleUrl || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, imageAvatarIdleUrl: e.target.value })
                        }
                        style={{
                          flex: 1,
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                        }}
                      >
                        <option value="">アップロード済み画像から選択</option>
                        {bgImageAssets.map((asset) => (
                          <option key={asset.url} value={asset.url}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedDomain.imageAvatarIdleUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                          src={selectedDomain.imageAvatarIdleUrl}
                          alt="2Dアバター待機時プレビュー"
                          loading="lazy"
                          style={{
                            width: '56px',
                            height: '56px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb',
                            backgroundColor: '#f8fafc',
                          }}
                        />
                        <span style={{ fontSize: '12px', color: '#666' }}>待機時プレビュー</span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      2Dアバター - 発話時画像URL
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        value={selectedDomain.imageAvatarTalkUrl || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, imageAvatarTalkUrl: e.target.value })
                        }
                        placeholder="発話時の画像URL"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                        }}
                      />
                      <select
                        value={selectedDomain.imageAvatarTalkUrl || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, imageAvatarTalkUrl: e.target.value })
                        }
                        style={{
                          flex: 1,
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                        }}
                      >
                        <option value="">アップロード済み画像から選択</option>
                        {bgImageAssets.map((asset) => (
                          <option key={asset.url} value={asset.url}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedDomain.imageAvatarTalkUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                          src={selectedDomain.imageAvatarTalkUrl}
                          alt="2Dアバター発話時プレビュー"
                          loading="lazy"
                          style={{
                            width: '56px',
                            height: '56px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb',
                            backgroundColor: '#f8fafc',
                          }}
                        />
                        <span style={{ fontSize: '12px', color: '#666' }}>発話時プレビュー</span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      2Dアバター - 発話アニメーション間隔（ms）
                    </label>
                    <input
                      type="number"
                      value={selectedDomain.imageAvatarTalkIntervalMs || ''}
                      onChange={(e) =>
                        setSelectedDomain({ ...selectedDomain, imageAvatarTalkIntervalMs: e.target.value ? parseInt(e.target.value, 10) : undefined })
                      }
                      placeholder="例: 500"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Style-Bert-VITS2 モデルID
                      </label>
                      <select
                        value={selectedDomain.stylebertvits2ModelId || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, stylebertvits2ModelId: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                          backgroundColor: 'white',
                        }}
                      >
                        <option value="">未設定（クライアント既定）</option>
                        {sbv2Models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name} (id: {model.id}) {model.isMultiSpeaker ? ' / 複数話者' : ' / 単一話者'}
                          </option>
                        ))}
                      </select>
                      {sbv2ModelsError && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309' }}>
                          {sbv2ModelsError}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Style-Bert-VITS2 スタイル
                      </label>
                      <input
                        type="text"
                        value={selectedDomain.stylebertvits2Style || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, stylebertvits2Style: e.target.value })
                        }
                        placeholder="例: Neutral"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      TTS設定
                    </label>
                    <select
                      value={selectedDomain.ttsMuted === true ? 'true' : selectedDomain.ttsMuted === false ? 'false' : ''}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setSelectedDomain({
                          ...selectedDomain,
                          ttsMuted: nextValue === '' ? undefined : nextValue === 'true',
                        });
                      }}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        backgroundColor: 'white',
                      }}
                    >
                      <option value="">未設定（グローバル設定を使用）</option>
                      <option value="true">TTS OFF（このドメインでは読み上げしない）</option>
                      <option value="false">TTS ON（このドメインでも読み上げする）</option>
                    </select>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                      未設定なら現在のグローバル TTS 設定をそのまま使います。
                    </div>
                  </div>

                  <div style={{ marginTop: '16px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fff' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>視線起動（ドメイン別）</div>

                    <div style={{ marginBottom: '12px' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontWeight: 'bold',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDomain.gazeWakeEnabled ?? true}
                          onChange={(e) =>
                            setSelectedDomain({ ...selectedDomain, gazeWakeEnabled: e.target.checked })
                          }
                        />
                        視線起動を有効にする
                      </label>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.9em',
                          fontWeight: 'bold',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDomain.gazeDebugUiEnabled ?? false}
                          onChange={(e) =>
                            setSelectedDomain({ ...selectedDomain, gazeDebugUiEnabled: e.target.checked })
                          }
                        />
                        視線起動デバッグ表示を有効にする
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                          起動感度 holdMs
                        </label>
                        <input
                          type="number"
                          min={500}
                          max={5000}
                          step={100}
                          value={selectedDomain.gazeHoldMs ?? 1500}
                          onChange={(e) =>
                            setSelectedDomain({
                              ...selectedDomain,
                              gazeHoldMs: Math.max(500, Math.min(5000, parseInt(e.target.value || '1500', 10))),
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                          リリース時間 releaseMs
                        </label>
                        <input
                          type="number"
                          min={300}
                          max={5000}
                          step={100}
                          value={selectedDomain.gazeReleaseMs ?? 1000}
                          onChange={(e) =>
                            setSelectedDomain({
                              ...selectedDomain,
                              gazeReleaseMs: Math.max(300, Math.min(5000, parseInt(e.target.value || '1000', 10))),
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                          再起動クールダウン cooldownMs
                        </label>
                        <input
                          type="number"
                          min={3000}
                          max={30000}
                          step={500}
                          value={selectedDomain.gazeCooldownMs ?? 10000}
                          onChange={(e) =>
                            setSelectedDomain({
                              ...selectedDomain,
                              gazeCooldownMs: Math.max(3000, Math.min(30000, parseInt(e.target.value || '10000', 10))),
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        開始発話テンプレート（1行1パターン）
                      </label>
                      <textarea
                        value={
                          (selectedDomain.gazeGreetings && selectedDomain.gazeGreetings.length > 0
                            ? selectedDomain.gazeGreetings
                            : DEFAULT_GAZE_GREETINGS
                          ).join('\n')
                        }
                        onChange={(e) => {
                          const phrases = e.target.value
                            .split(/\r?\n/)
                            .map((phrase) => phrase.trim())
                            .filter(Boolean);
                          setSelectedDomain({
                            ...selectedDomain,
                            gazeGreetings: phrases.length > 0 ? phrases : [...DEFAULT_GAZE_GREETINGS],
                          });
                        }}
                        rows={4}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', padding: '10px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', color: '#334155' }}>
                    同時接続数の上限は「公開管理」タブでグローバル設定します。
                  </div>

                  <div style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      SBV2 テスト再生テキスト
                    </label>
                    <textarea
                      value={sbv2TestText}
                      onChange={(e) => setSbv2TestText(e.target.value)}
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={handleTestPlaySbv2}
                        disabled={sbv2TestBusy}
                        style={{
                          padding: '8px 12px',
                          border: 'none',
                          borderRadius: '4px',
                          backgroundColor: sbv2TestBusy ? '#9ca3af' : '#2563eb',
                          color: 'white',
                          cursor: sbv2TestBusy ? 'default' : 'pointer',
                        }}
                      >
                        {sbv2TestBusy ? '再生中...' : 'テスト再生'}
                      </button>
                      <button
                        type="button"
                        onClick={stopPreviewAudio}
                        style={{
                          padding: '8px 12px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                          color: '#111827',
                          cursor: 'pointer',
                        }}
                      >
                        停止
                      </button>
                    </div>
                    {sbv2TestError && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#b91c1c' }}>
                        {sbv2TestError}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                    空欄ならドメイン切替時に クライアントの既定設定へ戻します。
                  </div>
                </div>
                  </>
                )}

                {activeDomainSubTab === 'connections' && (
                  <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    組み合わせるナレッジ
                  </label>
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {knowledges.map((knowledge) => (
                      <label key={knowledge.id} style={{ display: 'block', marginBottom: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedDomain.knowledgeIds.includes(knowledge.id)}
                          onChange={() => toggleDomainKnowledge(knowledge.id)}
                          style={{ marginRight: '8px' }}
                        />
                        {knowledge.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    組み合わせるMCPサーバー
                  </label>
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {mcpServers.length === 0 ? (
                      <div style={{ color: '#666', fontSize: '12px' }}>MCPサーバーを登録してください</div>
                    ) : (
                      mcpServers.map((server) => (
                        <label key={server.id} style={{ display: 'block', marginBottom: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(selectedDomain.mcpServerIds || []).includes(server.id)}
                            onChange={() => {
                              if (!selectedDomain.mcpServerIds) {
                                setSelectedDomain({
                                  ...selectedDomain,
                                  mcpServerIds: [server.id],
                                });
                              } else if (selectedDomain.mcpServerIds.includes(server.id)) {
                                setSelectedDomain({
                                  ...selectedDomain,
                                  mcpServerIds: selectedDomain.mcpServerIds.filter((id) => id !== server.id),
                                });
                              } else {
                                setSelectedDomain({
                                  ...selectedDomain,
                                  mcpServerIds: [...selectedDomain.mcpServerIds, server.id],
                                });
                              }
                            }}
                            style={{ marginRight: '8px' }}
                            disabled={!server.enabled}
                          />
                          {server.name}
                          {!server.enabled && <span style={{ marginLeft: '4px', color: '#999', fontSize: '12px' }}>(無効)</span>}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    組み合わせるCHRONICLE
                  </label>
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {chronicles.length === 0 ? (
                      <div style={{ color: '#666', fontSize: '12px' }}>CHRONICLEを登録してください</div>
                    ) : (
                      chronicles.map((chronicle) => (
                        <label key={chronicle.id} style={{ display: 'block', marginBottom: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(selectedDomain.chronicleIds || []).includes(chronicle.id)}
                            onChange={() => toggleDomainChronicle(chronicle.id)}
                            style={{ marginRight: '8px' }}
                            disabled={!chronicle.enabled}
                          />
                          {chronicle.name}
                          {!chronicle.enabled && <span style={{ marginLeft: '4px', color: '#999', fontSize: '12px' }}>(無効)</span>}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>組み合わせるメモリー</div>
                  <div style={{ marginLeft: '10px' }}>
                    {memories.length === 0 ? (
                      <div style={{ color: '#666', fontSize: '12px' }}>メモリーを登録してください</div>
                    ) : (
                      memories.map((memory) => (
                        <label key={`${memory.id}`} style={{ display: 'block', marginBottom: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(selectedDomain.memoryIds || []).includes(String(memory.id))}
                            onChange={() => toggleDomainMemory(memory.id)}
                            style={{ marginRight: '8px' }}
                            disabled={!memory.active}
                          />
                          {memory.name}
                          {!memory.active && <span style={{ marginLeft: '4px', color: '#999', fontSize: '12px' }}>(無効)</span>}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 'bold' }}>メモリー使用量インジケーター</div>
                    <button
                      type="button"
                      onClick={async () => {
                        const token = localStorage.getItem('injection_token');
                        if (!token) {
                          return;
                        }
                        await loadRuntimeModelInfo(token);
                      }}
                      disabled={runtimeInfoLoading}
                      style={{
                        padding: '6px 10px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: runtimeInfoLoading ? '#ccc' : '#2563eb',
                        color: 'white',
                        cursor: runtimeInfoLoading ? 'default' : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {runtimeInfoLoading ? '取得中...' : 'モデル情報を再取得'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', color: '#444' }}>
                      <strong>現在モデル:</strong> {runtimeModelInfo?.modelName || '未取得'}
                      <span style={{ marginLeft: '6px', color: '#666' }}>
                        ({runtimeModelInfo?.modelSource || 'unknown'})
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#444' }}>
                      <strong>推定元:</strong> {runtimeModelInfo?.contextSource || 'default'}
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      最大コンテキスト（手動設定可）
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder={`${runtimeModelInfo?.contextLength || 8192}`}
                      value={manualContextLimitInput}
                      onChange={(e) => setManualContextLimitInput(e.target.value)}
                      style={{
                        width: '220px',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      }}
                    />
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                      空欄時は自動取得値を使用（/api/show → Modelfile/metadata解析 → 既定値8K/32K）
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    <div>① 文字数: <strong>{memoryMetrics.charCount.toLocaleString()}</strong></div>
                    <div>② UTF-8バイト数: <strong>{memoryMetrics.utf8Bytes.toLocaleString()}</strong></div>
                    <div>③ 推定トークン数: <strong>{memoryMetrics.estimatedTokenCount.toLocaleString()}</strong></div>
                    <div>
                      ④ 使用率: <strong>{memoryMetrics.usageRate.toFixed(1)}%</strong>
                      <span style={{ marginLeft: '6px', fontSize: '12px', color: '#666' }}>
                        / {memoryMetrics.contextLimit.toLocaleString()} tokens
                      </span>
                    </div>
                  </div>

                  <div style={{ marginBottom: '8px', height: '10px', backgroundColor: '#eee', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, memoryMetrics.usageRate)}%`,
                        height: '100%',
                        transition: 'width 0.2s ease',
                        backgroundColor:
                          memoryMetrics.warningLevel === 'danger'
                            ? '#dc2626'
                            : memoryMetrics.warningLevel === 'warning'
                              ? '#f59e0b'
                              : '#16a34a',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      fontWeight: 'bold',
                      color:
                        memoryMetrics.warningLevel === 'danger'
                          ? '#b91c1c'
                          : memoryMetrics.warningLevel === 'warning'
                            ? '#b45309'
                            : '#166534',
                    }}
                  >
                    ⑤ 危険ライン警告: {
                      memoryMetrics.warningLevel === 'danger'
                        ? `危険（${DANGER_LINE_PERCENT}%超過）: コンテキスト削減推奨`
                        : memoryMetrics.warningLevel === 'warning'
                          ? `注意（${WARNING_LINE_PERCENT}%超過）: 余裕が少なくなっています`
                          : '安全圏'
                    }
                  </div>

                  {runtimeInfoError && (
                    <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '12px' }}>{runtimeInfoError}</div>
                  )}
                </div>

                <details style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>合成結果プレビュー（保存後反映）</summary>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#444', whiteSpace: 'pre-wrap' }}>{composedDomainText || '(空)'}</div>
                </details>
                  </>
                )}

                {activeDomainSubTab === 'test' && (
                  <>
                <div style={{ marginBottom: '15px', padding: '14px', border: '1px solid #bfdbfe', borderRadius: '8px', backgroundColor: '#f8fbff' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#1d4ed8' }}>管理画面内テストチャット</div>
                  <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                    現在のドメイン設定をそのまま使って、公開せずに応答確認できます。まだ保存していないベースプロンプト、ナレッジ選択、MCP選択、CHRONICLE選択も次の送信から反映されます。
                  </div>
                </div>

                <div style={{ marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                    会話プレビュー
                  </div>
                  <div style={{ padding: '14px', display: 'grid', gap: '10px', minHeight: '220px', maxHeight: '420px', overflowY: 'auto' }}>
                    {domainTestChatMessages.length === 0 ? (
                      <div style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.7 }}>
                        まだ会話はありません。下の入力欄からテストメッセージを送ると、現在のドメイン構成で応答を確認できます。
                      </div>
                    ) : (
                      domainTestChatMessages.map((message) => (
                        <div
                          key={message.id}
                          style={{
                            justifySelf: message.role === 'user' ? 'end' : 'start',
                            maxWidth: '85%',
                            padding: '12px 14px',
                            borderRadius: '12px',
                            backgroundColor: message.role === 'user' ? '#2563eb' : '#f3f4f6',
                            color: message.role === 'user' ? '#fff' : '#111827',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.7,
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
                          }}
                        >
                          <div style={{ fontSize: '11px', opacity: 0.75, marginBottom: '6px' }}>
                            {message.role === 'user' ? 'あなた' : '応答'} ・ {formatAdminTimestamp(message.createdAt)}
                          </div>
                          <div>{message.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '15px', display: 'grid', gap: '10px' }}>
                  <textarea
                    value={domainTestChatInput}
                    onChange={(e) => setDomainTestChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void handleSendDomainTestChat();
                      }
                    }}
                    rows={4}
                    placeholder="例: このドメインで利用できる申請手続きを教えてください"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleSendDomainTestChat}
                      disabled={domainTestChatBusy}
                      style={{
                        padding: '10px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: domainTestChatBusy ? '#94a3b8' : '#2563eb',
                        color: 'white',
                        cursor: domainTestChatBusy ? 'default' : 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      {domainTestChatBusy ? '送信中...' : 'テスト送信'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDomainTestChatMessages([]);
                        setDomainTestChatError('');
                        setDomainTestChatResult(null);
                        domainTestChatSessionIdRef.current = selectedDomain ? createAdminPreviewSessionId(selectedDomain.id) : '';
                      }}
                      style={{
                        padding: '10px 16px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: '#fff',
                        color: '#111827',
                        cursor: 'pointer',
                      }}
                    >
                      会話をクリア
                    </button>
                    <div style={{ alignSelf: 'center', fontSize: '12px', color: '#64748b' }}>
                      Ctrl+Enter でも送信できます
                    </div>
                  </div>
                  {domainTestChatError && (
                    <div style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '13px' }}>
                      {domainTestChatError}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>実行サマリー</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', fontSize: '13px', color: '#334155' }}>
                      <div><strong>モデル:</strong> {domainTestChatResult?.modelName || runtimeModelInfo?.modelName || '未取得'}</div>
                      <div><strong>backend:</strong> {domainTestChatResult?.backend || runtimeModelInfo?.backend || 'unknown'}</div>
                      <div><strong>MCP:</strong> {domainTestChatResult?.intercept?.metadata?.mcpUsed ? '使用あり' : '未使用'}</div>
                      <div><strong>CHRONICLE:</strong> {domainTestChatResult?.intercept?.metadata?.chronicleUsed ? '使用あり' : '未使用'}</div>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                      requestId: {domainTestChatResult?.intercept?.metadata?.requestId || '-'}
                    </div>
                  </div>

                  {(domainTestChatResult?.intercept?.metadata?.mcpUsed || domainTestChatResult?.intercept?.metadata?.mcpError || domainTestChatResult?.intercept?.dbResult) && (
                    <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>MCP デバッグ</div>
                      <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#334155' }}>
                        <div><strong>サーバー:</strong> {domainTestChatResult?.intercept?.metadata?.mcpServerId || '-'}</div>
                        <div><strong>ツール:</strong> {domainTestChatResult?.intercept?.metadata?.mcpToolName || '-'}</div>
                        {domainTestChatResult?.intercept?.dbResult?.summary && (
                          <div><strong>概要:</strong> {domainTestChatResult.intercept.dbResult.summary}</div>
                        )}
                        {domainTestChatResult?.intercept?.metadata?.mcpError && (
                          <div style={{ color: '#b91c1c' }}><strong>エラー:</strong> {domainTestChatResult.intercept.metadata.mcpError}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {(domainTestChatResult?.intercept?.metadata?.chronicleUsed || domainTestChatResult?.intercept?.metadata?.chronicleError || domainTestChatResult?.intercept?.chronicle?.content) && (
                    <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>CHRONICLE デバッグ</div>
                      <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#334155' }}>
                        <div><strong>名称:</strong> {domainTestChatResult?.intercept?.metadata?.chronicleName || domainTestChatResult?.intercept?.chronicle?.sourceName || '-'}</div>
                        {domainTestChatResult?.intercept?.metadata?.chronicleError && (
                          <div style={{ color: '#b91c1c' }}><strong>エラー:</strong> {domainTestChatResult.intercept.metadata.chronicleError}</div>
                        )}
                        {domainTestChatResult?.intercept?.chronicle?.content && (
                          <details style={{ marginTop: '4px' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>取得内容を見る</summary>
                            <div style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.7, color: '#475569' }}>
                              {domainTestChatResult.intercept.chronicle.content}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  </>
                )}
              </form>

              {message && (
                <div
                  style={{
                    padding: '10px',
                    marginBottom: '15px',
                    backgroundColor: message.includes('失敗') ? '#ffebee' : '#e8f5e9',
                    color: message.includes('失敗') ? '#c62828' : '#2e7d32',
                    borderRadius: '4px',
                  }}
                >
                  {message}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  backgroundColor: saving ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: saving ? 'default' : 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
                </div>
              ) : (
                <p>ドメインを選択してください</p>
              )}
            </main>
          </>
        ) : activeTab === 'shared-log' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>履歴条件</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontWeight: 600 }}>ドメイン</span>
                  <select
                    value={sharedLogFilterDomainId || (selectedDomain?.sharedLogEnabled ? selectedDomain.id : SHARED_LOG_ALL_DOMAINS)}
                    onChange={(e) => setSharedLogFilterDomainId(e.target.value)}
                    style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    {selectedDomain?.id && selectedDomain.sharedLogEnabled && (
                      <option value="">現在の選択ドメイン: {selectedDomain.name}</option>
                    )}
                    <option value={SHARED_LOG_ALL_DOMAINS}>全ドメイン</option>
                    {sharedLogEnabledDomains.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontWeight: 600 }}>表示件数</span>
                  <select
                    value={sharedLogsLimit}
                    onChange={(e) => setSharedLogsLimit(parseInt(e.target.value, 10))}
                    style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value={20}>20件</option>
                    <option value={50}>50件</option>
                    <option value={100}>100件</option>
                    <option value={200}>200件</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontWeight: 600 }}>ユーザー</span>
                  <select
                    value={sharedLogFilterUserId}
                    onChange={(e) => setSharedLogFilterUserId(e.target.value)}
                    style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value={SHARED_LOG_ALL_USERS}>全ユーザー</option>
                    {sharedLogAvailableUserIds.map((userId) => (
                      <option key={userId} value={userId}>
                        {userId}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontWeight: 600 }}>セッション</span>
                  <select
                    value={sharedLogFilterSessionId}
                    onChange={(e) => setSharedLogFilterSessionId(e.target.value)}
                    style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value={SHARED_LOG_ALL_SESSIONS}>全セッション</option>
                    {sharedLogAvailableSessionIds.map((sessionId) => (
                      <option key={sessionId} value={sessionId}>
                        {sessionId}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    const token = localStorage.getItem('injection_token');
                    if (!token) {
                      setMessage('認証情報が見つかりません。再ログインしてください');
                      return;
                    }

                    loadDomainSharedLogs(token, {
                      domainId: effectiveSharedLogDomainId || undefined,
                      userId: effectiveSharedLogUserId || undefined,
                      sessionId: effectiveSharedLogSessionId || undefined,
                      limit: sharedLogsLimit,
                    });
                  }}
                  disabled={sharedLogsLoading}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: sharedLogsLoading ? '#ccc' : '#0066cc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: sharedLogsLoading ? 'default' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {sharedLogsLoading ? '読込中...' : '再読込'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSharedLogs}
                  disabled={sharedLogDownloadBusy || !selectedDomain?.id}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: sharedLogDownloadBusy || !selectedDomain?.id ? '#ccc' : '#0f766e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: sharedLogDownloadBusy || !selectedDomain?.id ? 'default' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {sharedLogDownloadBusy ? '保存中...' : '選択ドメイン全件JSON保存'}
                </button>

                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px', lineHeight: 1.6 }}>
                  <div>取得件数: {sharedLogs.length} / {sharedLogsTotal}</div>
                  <div>対象: {effectiveSharedLogDomainId ? sharedLogEnabledDomains.find((domain) => domain.id === effectiveSharedLogDomainId)?.name || effectiveSharedLogDomainId : '全ドメイン'}</div>
                  <div>ユーザー: {effectiveSharedLogUserId || '全ユーザー'}</div>
                  <div>セッション: {effectiveSharedLogSessionId || '全セッション'}</div>
                  {selectedDomain && selectedDomain.sharedLogEnabled === false && (!effectiveSharedLogDomainId || effectiveSharedLogDomainId === selectedDomain.id) && (
                    <div style={{ marginTop: '8px', color: '#b45309' }}>
                      現在の選択ドメインではログ記録がOFFです。
                    </div>
                  )}
                </div>
              </div>
            </aside>

            <main>
                  <h2 style={{ marginTop: 0 }}>チャット履歴一覧</h2>
              <p style={{ color: '#555', marginTop: '0', marginBottom: '16px' }}>
                  フロントアプリの IndexedDB に保存している履歴と同じ内容を、新しい順で表示します。
              </p>

              {sharedLogsError && (
                <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '6px', backgroundColor: '#ffebee', color: '#c62828' }}>
                  {sharedLogsError}
                </div>
              )}

              {sharedLogsLoading ? (
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>チャット履歴を読み込み中です...</div>
              ) : sharedLogs.length === 0 ? (
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>該当するチャット履歴はありません。</div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {sortedSharedLogs.map((log) => {
                    const domain = domains.find((item) => item.id === log.domainId);
                    const isExpanded = expandedSharedLogId === log.historyId;

                    return (
                      <section
                        key={log.historyId}
                        style={{
                          border: '1px solid #d7dee7',
                          borderRadius: '8px',
                          padding: '16px',
                          backgroundColor: '#fff',
                          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 520px' }}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '12px', fontWeight: 600 }}>
                                {domain?.name || log.domainId}
                              </span>
                              <span style={{ padding: '2px 8px', borderRadius: '9999px', backgroundColor: log.role === 'user' ? '#dcfce7' : log.role === 'assistant' ? '#ede9fe' : '#e5e7eb', color: log.role === 'user' ? '#166534' : log.role === 'assistant' ? '#6d28d9' : '#374151', fontSize: '12px', fontWeight: 600 }}>
                                {formatSharedLogRoleLabel(log.role)}
                              </span>
                              {log.mcpInfo?.used && (
                                <span style={{ padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#ecfccb', color: '#3f6212', fontSize: '12px', fontWeight: 600 }}>
                                  MCP{log.mcpInfo?.toolName ? `: ${log.mcpInfo.toolName}` : ''}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                              {formatAdminTimestamp(log.createdAt)}
                            </div>
                            <div style={{ fontWeight: 600, marginBottom: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                              {log.content}
                            </div>
                            <div style={{ display: 'grid', gap: '4px', color: '#475569', fontSize: '13px' }}>
                              <div>historyId: {log.historyId}</div>
                              <div>userId: {log.userId || '-'}</div>
                              <div>sessionId: {log.sessionId || '-'}</div>
                              <div>dayKey: {log.createdAtDayKey}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedSharedLogId(isExpanded ? null : log.historyId)}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: isExpanded ? '#e2e8f0' : '#f8fafc',
                              color: '#0f172a',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            {isExpanded ? '詳細を閉じる' : '詳細を見る'}
                          </button>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: '16px', display: 'grid', gap: '16px' }}>
                            {Boolean(log.dbResult) && (
                              <div>
                                <h4 style={{ margin: '0 0 8px 0' }}>dbResult</h4>
                                <pre style={{ margin: 0, padding: '12px', backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: '6px', overflowX: 'auto', fontSize: '12px' }}>
                                  {JSON.stringify(log.dbResult, null, 2)}
                                </pre>
                              </div>
                            )}
                            {Boolean(log.mcpInfo) && (
                              <div>
                                <h4 style={{ margin: '0 0 8px 0' }}>mcpInfo</h4>
                                <pre style={{ margin: 0, padding: '12px', backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: '6px', overflowX: 'auto', fontSize: '12px' }}>
                                  {JSON.stringify(log.mcpInfo, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </main>
          </>
        ) : activeTab === 'knowledge' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>ナレッジ一覧</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleCreateKnowledge}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ＋追加
                </button>
                <button
                  type="button"
                  onClick={handleDeleteKnowledge}
                  disabled={!selectedKnowledge}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: !selectedKnowledge ? '#ccc' : '#ef5350',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: !selectedKnowledge ? 'default' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  削除
                </button>
              </div>
              {knowledges.length === 0 ? (
                <p>ナレッジがありません</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {knowledges.map((knowledge) => (
                    <li key={knowledge.id} style={{ marginBottom: '8px' }}>
                      <button
                        onClick={() => setSelectedKnowledge(knowledge)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: 'none',
                          borderRadius: '4px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          backgroundColor: selectedKnowledge?.id === knowledge.id ? '#0066cc' : '#f0f0f0',
                          color: selectedKnowledge?.id === knowledge.id ? 'white' : 'black',
                        }}
                      >
                        {knowledge.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <main>
              <h2 style={{ marginTop: 0 }}>ナレッジ管理</h2>
              {selectedKnowledge ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveKnowledge();
                  }}
                >
                  <div style={{ marginBottom: '12px', padding: '12px', border: '1px solid #b3e5fc', borderRadius: '6px', backgroundColor: '#f3fbff' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>サイト解析 → ナレッジ作成/再取得更新</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 120px', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="url"
                        value={knowledgeCrawlUrl}
                        onChange={(e) => {
                          setKnowledgeCrawlUrl(e.target.value);
                          setKnowledgeCrawlError('');
                          setKnowledgeCrawlSuccess('');
                        }}
                        placeholder="https://example.com"
                        disabled={knowledgeCrawling}
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                      />
                      <input
                        type="text"
                        value={knowledgeCrawlName}
                        onChange={(e) => {
                          setKnowledgeCrawlName(e.target.value);
                          setKnowledgeCrawlError('');
                          setKnowledgeCrawlSuccess('');
                        }}
                        placeholder="ナレッジ名（省略可）"
                        disabled={knowledgeCrawling}
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                      />
                      <input
                        type="number"
                        min={1}
                        max={30}
                        step={1}
                        value={knowledgeCrawlMaxPages}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          setKnowledgeCrawlMaxPages(Number.isFinite(n) ? n : 1);
                          setKnowledgeCrawlError('');
                          setKnowledgeCrawlSuccess('');
                        }}
                        disabled={knowledgeCrawling}
                        title="最大ページ数 (1-30)"
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '8px', marginBottom: '8px' }}>
                      <select
                        value={knowledgeCrawlMcpServerId}
                        onChange={(e) => {
                          setKnowledgeCrawlMcpServerId(e.target.value);
                          setKnowledgeCrawlError('');
                          setKnowledgeCrawlSuccess('');
                        }}
                        disabled={knowledgeCrawling}
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                      >
                        <option value="">MCPサーバーを選択</option>
                        {mcpServers
                          .filter((s) => s.enabled)
                          .map((server) => (
                            <option key={server.id} value={server.id}>
                              {server.name} ({server.id})
                            </option>
                          ))}
                      </select>

                      <select
                        value={knowledgeAttachDomainId}
                        onChange={(e) => {
                          setKnowledgeAttachDomainId(e.target.value);
                          setKnowledgeCrawlError('');
                          setKnowledgeCrawlSuccess('');
                        }}
                        disabled={knowledgeCrawling}
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                      >
                        <option value="">ドメインへアタッチしない</option>
                        {domains.map((domain) => (
                          <option key={domain.id} value={domain.id}>
                            {domain.name} ({domain.id})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleCreateKnowledgeFromSite}
                        disabled={knowledgeCrawling || !knowledgeCrawlUrl.trim()}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: knowledgeCrawling ? '#aaa' : '#0288d1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: knowledgeCrawling ? 'default' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {knowledgeCrawling ? '生成中...' : 'ナレッジ生成'}
                      </button>

                      <button
                        type="button"
                        onClick={handleRefreshKnowledgeFromSite}
                        disabled={knowledgeCrawling || !knowledgeCrawlUrl.trim() || !selectedKnowledge}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: knowledgeCrawling || !selectedKnowledge ? '#aaa' : '#2e7d32',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: knowledgeCrawling || !selectedKnowledge ? 'default' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {knowledgeCrawling ? '更新中...' : '再取得して更新'}
                      </button>
                    </div>

                    {knowledgeCrawlError && <div style={{ color: '#c62828', fontSize: '13px' }}>{knowledgeCrawlError}</div>}
                    {knowledgeCrawlSuccess && <div style={{ color: '#2e7d32', fontSize: '13px' }}>{knowledgeCrawlSuccess}</div>}
                    <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                      「ナレッジ生成」は新規作成、「再取得して更新」は選択中ナレッジの内容を上書き更新します。どちらも必要に応じてドメインへ自動アタッチします。
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>ナレッジ名</label>
                    <input
                      type="text"
                      value={selectedKnowledge.name}
                      onChange={(e) => setSelectedKnowledge({ ...selectedKnowledge, name: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>説明</label>
                    <textarea
                      value={selectedKnowledge.description}
                      onChange={(e) => setSelectedKnowledge({ ...selectedKnowledge, description: e.target.value })}
                      rows={2}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>システムプロンプト片</label>
                    <textarea
                      value={selectedKnowledge.systemPrompt}
                      onChange={(e) => setSelectedKnowledge({ ...selectedKnowledge, systemPrompt: e.target.value })}
                      rows={4}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>コンテキスト片</label>
                    <textarea
                      value={selectedKnowledge.context}
                      onChange={(e) => setSelectedKnowledge({ ...selectedKnowledge, context: e.target.value })}
                      rows={4}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={selectedKnowledge.enabled}
                        onChange={(e) => setSelectedKnowledge({ ...selectedKnowledge, enabled: e.target.checked })}
                      />
                      有効
                    </label>

                    <label>
                      優先度
                      <input
                        type="number"
                        value={selectedKnowledge.priority}
                        onChange={(e) =>
                          setSelectedKnowledge({
                            ...selectedKnowledge,
                            priority: Number.isNaN(parseInt(e.target.value, 10))
                              ? selectedKnowledge.priority
                              : parseInt(e.target.value, 10),
                          })
                        }
                        style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </label>
                  </div>

                  {message && (
                    <div
                      style={{
                        padding: '10px',
                        marginBottom: '15px',
                        backgroundColor: message.includes('失敗') ? '#ffebee' : '#e8f5e9',
                        color: message.includes('失敗') ? '#c62828' : '#2e7d32',
                        borderRadius: '4px',
                      }}
                    >
                      {message}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingKnowledge}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: savingKnowledge ? '#ccc' : '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: savingKnowledge ? 'default' : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {savingKnowledge ? '保存中...' : 'ナレッジ保存'}
                  </button>
                </form>
              ) : (
                <p>ナレッジを選択してください</p>
              )}
            </main>
          </>
        ) : activeTab === 'chronicle' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>CHRONICLE一覧</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleCreateChronicle}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ＋追加
                </button>
                <button
                  type="button"
                  onClick={handleDeleteChronicle}
                  disabled={!selectedChronicle}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: !selectedChronicle ? '#ccc' : '#ef5350',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: !selectedChronicle ? 'default' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  削除
                </button>
              </div>

              {chronicles.length === 0 ? (
                <p>CHRONICLEがありません</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {chronicles.map((chronicle) => (
                    <li key={chronicle.id} style={{ marginBottom: '8px' }}>
                      <button
                        onClick={() => {
                          setSelectedChronicle(chronicle);
                          setChronicleDiscoverHost(chronicle.host);
                          setChronicleDiscoverApiPort(chronicle.apiPort);
                          setChronicleDiscoverTcpPort(chronicle.tcpPort);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: 'none',
                          borderRadius: '4px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          backgroundColor: selectedChronicle?.id === chronicle.id ? '#0066cc' : '#f0f0f0',
                          color: selectedChronicle?.id === chronicle.id ? 'white' : 'black',
                        }}
                      >
                        {chronicle.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <main>
              <h2 style={{ marginTop: 0 }}>CHRONICLE管理</h2>

              <div style={{ marginBottom: '14px', padding: '12px', border: '1px solid #b3e5fc', borderRadius: '6px', backgroundColor: '#f3fbff' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>BEYOND Core 検出と登録</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px auto', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={chronicleDiscoverHost}
                    onChange={(e) => setChronicleDiscoverHost(e.target.value)}
                    placeholder="127.0.0.1"
                    style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={chronicleDiscoverApiPort}
                    onChange={(e) => setChronicleDiscoverApiPort(parseInt(e.target.value, 10) || 8000)}
                    style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={chronicleDiscoverTcpPort}
                    onChange={(e) => setChronicleDiscoverTcpPort(parseInt(e.target.value, 10) || 8001)}
                    style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                  <button
                    type="button"
                    onClick={handleDiscoverChronicle}
                    disabled={chronicleBusy}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: chronicleBusy ? '#ccc' : '#2563eb',
                      color: 'white',
                      cursor: chronicleBusy ? 'default' : 'pointer',
                    }}
                  >
                    {chronicleBusy ? '検出中...' : 'Discoverして登録'}
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: '#555' }}>
                  host, API Port, TCP Port を指定して BEYOND Core MCP を検出します。
                </div>
              </div>

              {selectedChronicle ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveChronicle();
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>CHRONICLE名</label>
                    <input
                      type="text"
                      value={selectedChronicle.name}
                      onChange={(e) => setSelectedChronicle({ ...selectedChronicle, name: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>説明</label>
                    <textarea
                      value={selectedChronicle.description}
                      onChange={(e) => setSelectedChronicle({ ...selectedChronicle, description: e.target.value })}
                      rows={3}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: '10px', marginBottom: '12px' }}>
                    <label>
                      Host
                      <input
                        type="text"
                        value={selectedChronicle.host}
                        onChange={(e) => setSelectedChronicle({ ...selectedChronicle, host: e.target.value })}
                        style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </label>
                    <label>
                      API Port
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={selectedChronicle.apiPort}
                        onChange={(e) => setSelectedChronicle({ ...selectedChronicle, apiPort: parseInt(e.target.value, 10) || 8000 })}
                        style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </label>
                    <label>
                      TCP Port
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={selectedChronicle.tcpPort}
                        onChange={(e) => setSelectedChronicle({ ...selectedChronicle, tcpPort: parseInt(e.target.value, 10) || 8001 })}
                        style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </label>
                  </div>

                  <div style={{ marginBottom: '12px', fontSize: '12px', color: '#666' }}>
                    最終検出: {selectedChronicle.lastDiscoveredAt || '未実行'}
                    <br />
                    最終接続確認: {selectedChronicle.lastConnectedAt || '未実行'}
                  </div>

                  <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#f9f9f9' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                       <div style={{ fontWeight: 'bold' }}>対応メモリー</div>
                       <button
                         type="button"
                         onClick={async () => {
                           const token = localStorage.getItem('injection_token');
                           if (!token) return;
                           await loadMemories(token, selectedChronicle.id);
                         }}
                         disabled={loadingMemories}
                         style={{
                           padding: '4px 8px',
                           fontSize: '12px',
                           backgroundColor: loadingMemories ? '#ccc' : '#2563eb',
                           color: 'white',
                           border: 'none',
                           borderRadius: '4px',
                           cursor: loadingMemories ? 'default' : 'pointer',
                         }}
                       >
                         {loadingMemories ? '更新中...' : '更新'}
                       </button>
                     </div>
                    <div style={{ marginLeft: '10px', fontSize: '13px' }}>
                      {memories.length === 0 ? (
                        <div style={{ color: '#999' }}>メモリーが登録されていません</div>
                      ) : (
                        <>
                          <div style={{ marginBottom: '8px', color: '#666' }}>
                            登録済みメモリー: {memories.length}個
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {memories.map((memory) => (
                              <div
                                key={`${memory.id}`}
                                style={{
                                  padding: '10px',
                                  border: memory.active ? '2px solid #10b981' : '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  backgroundColor: memory.active ? '#f0fdf4' : '#f9fafb',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}
                              >
                                {/* Header: Name + Active Status */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                  <div style={{ fontWeight: '600', fontSize: '13px', color: '#1f2937', flex: 1 }}>
                                    {memory.name}
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    {memory.block_height !== undefined && (
                                      <span style={{
                                        fontSize: '9px',
                                        fontWeight: '600',
                                        padding: '2px 6px',
                                        backgroundColor: '#dbeafe',
                                        color: '#0369a1',
                                        borderRadius: '3px',
                                        border: '1px solid #0ea5e9',
                                      }}>
                                        🔗 On-Chain
                                      </span>
                                    )}
                                    <div style={{ fontSize: '11px', fontWeight: '500', color: memory.active ? '#10b981' : '#9ca3af' }}>
                                      {memory.active ? '✓ 有効' : '○ 無効'}
                                    </div>
                                  </div>
                                </div>

                                {/* On-chain Info: Block Height + Network */}
                                {memory.block_height !== undefined && (
                                  <div style={{ fontSize: '11px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>🔗</span>
                                    <span>
                                      Block #{memory.block_height.toLocaleString()}
                                      {memory.network && ` (${memory.network})`}
                                    </span>
                                  </div>
                                )}

                                {/* Item Count */}
                                {memory.item_count !== undefined && memory.item_count > 0 && (
                                  <div style={{ fontSize: '10px', color: '#6b7280' }}>
                                    📦 {memory.item_count}個のアイテム
                                  </div>
                                )}

                                {/* Summary */}
                                {memory.summary && (
                                  <div style={{ fontSize: '11px', color: '#4b5563', lineHeight: '1.4', maxHeight: '44px', overflow: 'hidden' }}>
                                    {memory.summary.substring(0, 120)}
                                    {memory.summary.length > 120 ? '...' : ''}
                                  </div>
                                )}

                                {/* Memory ID */}
                                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                                  ID: {memory.id}
                                </div>

                                {/* Toggle Button */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleMemoryActive(memory.id, !memory.active)}
                                  disabled={updatingMemoryId === memory.id}
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    backgroundColor: updatingMemoryId === memory.id ? '#d1d5db' : memory.active ? '#ef4444' : '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: updatingMemoryId === memory.id ? 'default' : 'pointer',
                                    transition: 'background-color 0.2s',
                                  }}
                                >
                                  {updatingMemoryId === memory.id ? '更新中...' : memory.active ? '無効にする' : '有効にする'}
                                </button>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                            ※ メモリーはドメイン設定で選択されます
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {chronicleError && (
                    <div style={{ marginBottom: '10px', color: '#b91c1c', fontSize: '12px' }}>
                      {chronicleError}
                    </div>
                  )}

                  {message && (
                    <div
                      style={{
                        padding: '10px',
                        marginBottom: '15px',
                        backgroundColor: message.includes('失敗') ? '#ffebee' : '#e8f5e9',
                        color: message.includes('失敗') ? '#c62828' : '#2e7d32',
                        borderRadius: '4px',
                      }}
                    >
                      {message}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={chronicleBusy}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: chronicleBusy ? '#ccc' : '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: chronicleBusy ? 'default' : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {chronicleBusy ? '保存中...' : 'CHRONICLE保存'}
                  </button>
                </form>
              ) : (
                <p>CHRONICLEを選択してください</p>
              )}
            </main>
          </>
        ) : activeTab === 'asset' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>アセット</h3>
              <div style={{ marginBottom: '8px', fontSize: '13px', color: '#444' }}>
                VRM: <strong>{vrmAssets.length}</strong>
              </div>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#444' }}>
                画像: <strong>{bgImageAssets.length}</strong>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const token = localStorage.getItem('injection_token');
                  if (!token) {
                    setMessage('認証情報が見つかりません。再ログインしてください');
                    return;
                  }
                  await loadAllAssets(token);
                  setMessage('アセット一覧を更新しました');
                  setTimeout(() => setMessage(''), 3000);
                }}
                style={{
                  padding: '8px 10px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                一覧を再取得
              </button>
            </aside>

            <main>
              <h2 style={{ marginTop: 0 }}>アセット管理</h2>

              <div style={{ marginBottom: '20px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>画像（bgimage）</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <label
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: uploadingAsset === 'bgimage' ? '#eee' : '#f8f8f8',
                      cursor: uploadingAsset === 'bgimage' ? 'default' : 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {uploadingAsset === 'bgimage' ? 'アップロード中...' : '画像をアップロード'}
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.gif"
                      disabled={uploadingAsset === 'bgimage'}
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        event.target.value = '';
                        void handleUploadAsset('bgimage', file);
                      }}
                    />
                  </label>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: '4px', overflow: 'hidden' }}>
                  {bgImageAssets.length === 0 ? (
                    <div style={{ padding: '10px', color: '#666' }}>画像がありません</div>
                  ) : (
                    bgImageAssets.map((asset) => (
                      <div key={asset.url} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                          <img
                            src={asset.url}
                            alt={asset.name}
                            loading="lazy"
                            style={{
                              width: '56px',
                              height: '56px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid #e5e7eb',
                              flexShrink: 0,
                              backgroundColor: '#f8fafc',
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                            <div style={{ fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.url}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={deletingAsset === 'bgimage'}
                          onClick={() => void handleDeleteAsset('bgimage', asset.url)}
                          style={{
                            padding: '6px 10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: deletingAsset === 'bgimage' ? '#eee' : '#fff1f2',
                            color: deletingAsset === 'bgimage' ? '#999' : '#b91c1c',
                            cursor: deletingAsset === 'bgimage' ? 'default' : 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {deletingAsset === 'bgimage' ? '削除中...' : '削除'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '20px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>VRM（vrm）</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <label
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: uploadingAsset === 'vrm' ? '#eee' : '#f8f8f8',
                      cursor: uploadingAsset === 'vrm' ? 'default' : 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {uploadingAsset === 'vrm' ? 'アップロード中...' : 'VRMをアップロード'}
                    <input
                      type="file"
                      accept=".vrm"
                      disabled={uploadingAsset === 'vrm'}
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        event.target.value = '';
                        void handleUploadAsset('vrm', file);
                      }}
                    />
                  </label>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: '4px', overflow: 'hidden' }}>
                  {vrmAssets.length === 0 ? (
                    <div style={{ padding: '10px', color: '#666' }}>VRMファイルがありません</div>
                  ) : (
                    vrmAssets.map((asset) => (
                      <div key={asset.url} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '10px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                          <div style={{ fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.url}</div>
                        </div>
                        <button
                          type="button"
                          disabled={deletingAsset === 'vrm'}
                          onClick={() => void handleDeleteAsset('vrm', asset.url)}
                          style={{
                            padding: '6px 10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: deletingAsset === 'vrm' ? '#eee' : '#fff1f2',
                            color: deletingAsset === 'vrm' ? '#999' : '#b91c1c',
                            cursor: deletingAsset === 'vrm' ? 'default' : 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {deletingAsset === 'vrm' ? '削除中...' : '削除'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </main>
          </>
        ) : activeTab === 'pronunciation' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>発音辞書一覧</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleCreatePronunciation}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ＋追加
                </button>
                <button
                  type="button"
                  onClick={handleDeletePronunciation}
                  disabled={!selectedPronunciation}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: !selectedPronunciation ? '#ccc' : '#ef5350',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: !selectedPronunciation ? 'default' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  削除
                </button>
              </div>

              {pronunciations.length === 0 ? (
                <p>発音辞書がありません</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {pronunciations.map((rule) => (
                    <li key={rule.id} style={{ marginBottom: '8px' }}>
                      <button
                        onClick={() => setSelectedPronunciation(rule)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: 'none',
                          borderRadius: '4px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          backgroundColor: selectedPronunciation?.id === rule.id ? '#0066cc' : '#f0f0f0',
                          color: selectedPronunciation?.id === rule.id ? 'white' : 'black',
                          fontSize: '12px',
                        }}
                      >
                        {rule.from} → {rule.to}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <main>
              <h2 style={{ marginTop: 0 }}>発音辞書管理</h2>
              <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fafafa' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>発音辞書設定</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={pronunciationSettings.wanaKanaEnabled}
                    onChange={(e) =>
                      setPronunciationSettings((prev) => ({
                        ...prev,
                        wanaKanaEnabled: e.target.checked,
                      }))
                    }
                  />
                  WanaKana で英字をかなへ補助変換する
                </label>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
                  変換順は「ユーザー辞書」→「WanaKana補助変換」です。ユーザーが設定した発音辞書を優先します。
                </div>
                <button
                  type="button"
                  onClick={() => void handleSavePronunciationSettings()}
                  disabled={savingPronunciationSettings}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: savingPronunciationSettings ? '#ccc' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: savingPronunciationSettings ? 'default' : 'pointer',
                  }}
                >
                  {savingPronunciationSettings ? '保存中...' : '設定を保存'}
                </button>
              </div>
              {selectedPronunciation ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSavePronunciation();
                    }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>変換前</label>
                      <input
                        type="text"
                        value={selectedPronunciation.from}
                        onChange={(e) => setSelectedPronunciation({ ...selectedPronunciation, from: e.target.value })}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>変換後（読み）</label>
                      <input
                        type="text"
                        value={selectedPronunciation.to}
                        onChange={(e) => setSelectedPronunciation({ ...selectedPronunciation, to: e.target.value })}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPronunciation.enabled}
                          onChange={(e) =>
                            setSelectedPronunciation({ ...selectedPronunciation, enabled: e.target.checked })
                          }
                        />
                        有効
                      </label>

                      <label>
                        優先度
                        <input
                          type="number"
                          value={selectedPronunciation.priority}
                          onChange={(e) =>
                            setSelectedPronunciation({
                              ...selectedPronunciation,
                              priority: Number.isNaN(parseInt(e.target.value, 10))
                                ? selectedPronunciation.priority
                                : parseInt(e.target.value, 10),
                            })
                          }
                          style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                        />
                      </label>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>適用ドメイン（未指定で全体）</label>
                      <select
                        value={selectedPronunciation.domainId || ''}
                        onChange={(e) =>
                          setSelectedPronunciation({
                            ...selectedPronunciation,
                            domainId: e.target.value || undefined,
                          })
                        }
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      >
                        <option value="">全ドメイン</option>
                        {domains.map((domain) => (
                          <option key={domain.id} value={domain.id}>
                            {domain.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {message && (
                      <div
                        style={{
                          padding: '10px',
                          marginBottom: '15px',
                          backgroundColor: message.includes('失敗') ? '#ffebee' : '#e8f5e9',
                          color: message.includes('失敗') ? '#c62828' : '#2e7d32',
                          borderRadius: '4px',
                        }}
                      >
                        {message}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={savingPronunciation}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: savingPronunciation ? '#ccc' : '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: savingPronunciation ? 'default' : 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      {savingPronunciation ? '保存中...' : '発音辞書保存'}
                    </button>
                  </form>

                  <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
                    <h3 style={{ marginTop: 0 }}>発音確認テスト</h3>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>確認するドメイン</label>
                      <select
                        value={pronunciationTestDomainId}
                        onChange={(e) => setPronunciationTestDomainId(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      >
                        <option value="">全ドメイン</option>
                        {domains.map((domain) => (
                          <option key={domain.id} value={domain.id}>
                            {domain.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>入力文</label>
                      <textarea
                        value={pronunciationTestInput}
                        onChange={(e) => setPronunciationTestInput(e.target.value)}
                        rows={4}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handlePreviewPronunciation}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        marginBottom: '12px',
                      }}
                    >
                      変換確認
                    </button>

                    <div style={{ padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>変換結果</div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#333' }}>
                        {pronunciationTestOutput || 'ここに変換後の読みが表示されます'}
                      </div>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                      WanaKana が ON の場合、このプレビューにも補助変換が反映されます。
                    </div>
                  </div>
                </>
              ) : (
                <p>発音辞書を選択してください</p>
              )}
            </main>
          </>
        ) : activeTab === 'public' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>公開管理</h3>
              <p style={{ color: '#666', fontSize: '13px', lineHeight: 1.6 }}>
                VPN公開時の同時接続制御をドメイン横断で管理します。
              </p>
            </aside>

            <main>
              <h2 style={{ marginTop: 0 }}>公開管理</h2>

              <div style={{ maxWidth: '520px', marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  同時接続数の上限（全ドメイン共通）
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={0}
                    value={publicSettings.maxConcurrentSessions}
                    onChange={(e) =>
                      setPublicSettings({
                        ...publicSettings,
                        maxConcurrentSessions: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    style={{
                      width: '140px',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    人（0 で無制限）
                  </span>
                </div>
              </div>

              <div style={{ maxWidth: '520px', marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  1ユーザーあたりの1分間チャット系リクエスト上限
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={0}
                    value={publicSettings.chatRequestsPerUserPerMinute}
                    onChange={(e) =>
                      setPublicSettings({
                        ...publicSettings,
                        chatRequestsPerUserPerMinute: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    style={{
                      width: '140px',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    req / 分 / 人（0 で無制限）
                  </span>
                </div>
              </div>

              <div style={{ maxWidth: '520px', marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  1ユーザーあたりの1分間音声リクエスト上限
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={0}
                    value={publicSettings.ttsRequestsPerUserPerMinute}
                    onChange={(e) =>
                      setPublicSettings({
                        ...publicSettings,
                        ttsRequestsPerUserPerMinute: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    style={{
                      width: '140px',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    req / 分 / 人（0 で無制限）
                  </span>
                </div>
              </div>

              <div
                style={{
                  maxWidth: '520px',
                  marginBottom: '18px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  color: '#334155',
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>現在の全体レート計算</div>
                <div>
                  チャット系: {publicSettings.chatRequestsPerUserPerMinute} req / 分 / 人 × {publicSettings.maxConcurrentSessions} 人
                  = {derivedGlobalChatRequestsPerMinute} req / 分
                </div>
                <div>
                  音声: {publicSettings.ttsRequestsPerUserPerMinute} req / 分 / 人 × {publicSettings.maxConcurrentSessions} 人
                  = {derivedGlobalTtsRequestsPerMinute} req / 分
                </div>
                <div style={{ marginTop: '6px', color: '#64748b' }}>
                  チャット系は intercept やログインなどの文字系公開 API、音声は Amica の TTS に適用されます。<br />
                  同時接続数が 0 の場合、全体上限は無効になり、1ユーザー上限のみ適用されます。
                </div>
              </div>

              {sessionStatus && (
                <div
                  style={{
                    marginBottom: '14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: sessionStatus.available ? '#ecfdf5' : '#fef2f2',
                    color: sessionStatus.available ? '#065f46' : '#991b1b',
                    border: `1px solid ${sessionStatus.available ? '#6ee7b7' : '#fecaca'}`,
                  }}
                >
                  <span>現在接続中</span>
                  <span>{sessionStatus.current}/{sessionStatus.max}</span>
                  <span>{sessionStatus.available ? '受付中' : '満席'}</span>
                </div>
              )}

              {sessionStatusError && (
                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#b91c1c' }}>
                  {sessionStatusError}
                </div>
              )}

              <div style={{ marginBottom: '16px', fontSize: '12px', color: '#9ca3af' }}>
                接続数は3秒ごとに自動更新されます。
              </div>

              <div
                style={{
                  maxWidth: '720px',
                  marginBottom: '18px',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #dbeafe',
                  backgroundColor: '#eff6ff',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1d4ed8' }}>
                  Cloudflare Tunnel 公開
                </div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.7, marginBottom: '12px' }}>
                  認証なしの一時的な Quick Tunnel を起動します。cloudflared がこのサーバーで実行可能な状態である必要があります。
                </div>
                <div style={{ maxWidth: '520px', marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#1e3a8a' }}>
                    公開先を選択
                  </label>
                  <select
                    value={selectedTunnelTargetId}
                    onChange={(e) => setSelectedTunnelTargetId(e.target.value)}
                    disabled={cloudflareTunnelBusy || cloudflareTunnelStatus?.active || cloudflareTunnelStatus?.starting}
                    style={{
                      width: '100%',
                      maxWidth: '420px',
                      padding: '8px',
                      border: '1px solid #bfdbfe',
                      borderRadius: '4px',
                      boxSizing: 'border-box',
                      backgroundColor:
                        cloudflareTunnelBusy || cloudflareTunnelStatus?.active || cloudflareTunnelStatus?.starting
                          ? '#dbeafe'
                          : 'white',
                    }}
                  >
                    {tunnelTargetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                    {selectedTunnelTarget?.description}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                    起動中は公開先を切り替えられません。切り替える場合は一度停止してください。
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.7, marginBottom: '12px' }}>
                  転送先: {cloudflareTunnelStatus?.targetUrl || selectedTunnelTarget?.url || 'http://127.0.0.1:3000'}
                </div>

                {cloudflareTunnelStatus?.publicUrl && (
                  <div style={{ marginBottom: '12px', fontSize: '13px', lineHeight: 1.7 }}>
                    公開 URL:{' '}
                    <a
                      href={cloudflareTunnelStatus.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb', fontWeight: 'bold', wordBreak: 'break-all' }}
                    >
                      {cloudflareTunnelStatus.publicUrl}
                    </a>
                  </div>
                )}

                <div style={{ marginBottom: '12px', fontSize: '12px', color: '#475569' }}>
                  状態: {cloudflareTunnelStatus?.active ? '公開中' : cloudflareTunnelStatus?.starting ? '起動中' : '停止中'}
                  {typeof cloudflareTunnelStatus?.pid === 'number' ? ` / PID: ${cloudflareTunnelStatus.pid}` : ''}
                </div>

                {cloudflareTunnelError && (
                  <div style={{ marginBottom: '12px', fontSize: '12px', color: '#b91c1c' }}>
                    {cloudflareTunnelError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleStartCloudflareTunnel}
                    disabled={cloudflareTunnelBusy || cloudflareTunnelStatus?.active || cloudflareTunnelStatus?.starting}
                    style={{
                      padding: '10px 16px',
                      backgroundColor:
                        cloudflareTunnelBusy || cloudflareTunnelStatus?.active || cloudflareTunnelStatus?.starting
                          ? '#93c5fd'
                          : '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor:
                        cloudflareTunnelBusy || cloudflareTunnelStatus?.active || cloudflareTunnelStatus?.starting
                          ? 'default'
                          : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {cloudflareTunnelBusy && cloudflareTunnelStatus?.starting ? '起動中...' : 'Cloudflare Tunnel を起動'}
                  </button>
                  <button
                    type="button"
                    onClick={handleStopCloudflareTunnel}
                    disabled={cloudflareTunnelBusy || (!cloudflareTunnelStatus?.active && !cloudflareTunnelStatus?.starting)}
                    style={{
                      padding: '10px 16px',
                      backgroundColor:
                        cloudflareTunnelBusy || (!cloudflareTunnelStatus?.active && !cloudflareTunnelStatus?.starting)
                          ? '#cbd5e1'
                          : '#475569',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor:
                        cloudflareTunnelBusy || (!cloudflareTunnelStatus?.active && !cloudflareTunnelStatus?.starting)
                          ? 'default'
                          : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    停止
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const token = localStorage.getItem('injection_token');
                      if (!token) {
                        setMessage('認証情報が見つかりません。再ログインしてください');
                        return;
                      }
                      loadCloudflareTunnelStatus(token);
                    }}
                    disabled={cloudflareTunnelBusy}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: cloudflareTunnelBusy ? '#e5e7eb' : '#f8fafc',
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      cursor: cloudflareTunnelBusy ? 'default' : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    状態を更新
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSavePublicSettings}
                disabled={savingPublicSettings}
                style={{
                  padding: '10px 16px',
                  backgroundColor: savingPublicSettings ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: savingPublicSettings ? 'default' : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {savingPublicSettings ? '保存中...' : '公開管理を保存'}
              </button>

              <div
                style={{
                  maxWidth: '720px',
                  marginTop: '20px',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#111827' }}>管理画面ログイン履歴</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      成功・失敗を含む最新100件のログイン履歴です。記録内容は IP と時刻です。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const token = localStorage.getItem('injection_token');
                      if (!token) {
                        setMessage('認証情報が見つかりません。再ログインしてください');
                        return;
                      }
                      void loadAdminLoginHistory(token);
                    }}
                    disabled={adminLoginHistoryLoading}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: adminLoginHistoryLoading ? '#e5e7eb' : '#f8fafc',
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      cursor: adminLoginHistoryLoading ? 'default' : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {adminLoginHistoryLoading ? '更新中...' : '履歴を更新'}
                  </button>
                </div>

                {adminLoginHistoryError && (
                  <div style={{ marginBottom: '12px', fontSize: '12px', color: '#b91c1c' }}>
                    {adminLoginHistoryError}
                  </div>
                )}

                {adminLoginHistoryLoading && adminLoginHistory.length === 0 ? (
                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', color: '#64748b' }}>
                    ログイン履歴を読み込み中です...
                  </div>
                ) : adminLoginHistory.length === 0 ? (
                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', color: '#64748b' }}>
                    まだログイン履歴がありません。
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', color: '#334155' }}>
                          <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>時刻</th>
                          <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>IP</th>
                          <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>結果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminLoginHistory.map((entry, index) => (
                          <tr key={`${entry.timestamp}-${entry.ip}-${index}`}>
                            <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', color: '#111827' }}>
                              {new Date(entry.timestamp).toLocaleString('ja-JP')}
                            </td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', color: '#111827', fontFamily: 'monospace' }}>
                              {entry.ip}
                            </td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '4px 10px',
                                  borderRadius: '9999px',
                                  fontWeight: 700,
                                  fontSize: '12px',
                                  backgroundColor: entry.success ? '#ecfdf5' : '#fef2f2',
                                  color: entry.success ? '#065f46' : '#991b1b',
                                  border: `1px solid ${entry.success ? '#6ee7b7' : '#fecaca'}`,
                                }}
                              >
                                {entry.success ? '成功' : '失敗'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          </>
        ) : activeTab === 'mcp' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>MCPサーバー一覧</h3>
              <div style={{ marginBottom: '14px'}}>
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt('新しいMCPサーバー名を入力してください:',  '新規MCP');
                    if (!name) return;

                    const token = localStorage.getItem('injection_token');
                    if (!token) {
                      setMessage('認証情報が見つかりません。再ログインしてください');
                      return;
                    }

                    (async () => {
                      try {
                        setSavingMcpServer(true);
                        const res = await fetch('/api/mcp-servers', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            name,
                            description: '',
                            transport: 'sse',
                            mode: 'rule',
                            config: { url: '' },
                            enabled: true,
                            timeout: 30000,
                            ruleRouting: {
                              enabled: true,
                              rules: [
                                {
                                  id: 'time_default',
                                  enabled: true,
                                  priority: 100,
                                  keywords: ['時刻', '時間', '何時', 'current time'],
                                  toolName: 'get_current_time',
                                },
                              ],
                            },
                            aiRouting: {
                              enabled: false,
                              provider: 'ollama',
                              model: 'qwen2.5:7b',
                              systemPrompt:
                                'あなたはMCPツールルーターです。JSONのみ返答してください。{"tool":"<toolName|no_tool>","arguments":{},"confidence":0.0,"reason":"..."}',
                              temperature: 0.1,
                              maxTokens: 240,
                              confidenceThreshold: 0.55,
                              allowedTools: ['get_current_time', 'get_mock_weather', 'calculate', 'list_tools_info', 'echo'],
                              fallbackTool: 'get_current_time',
                            },
                          }),
                        });

                        if (res.ok) {
                          const payload = await res.json();
                          setMcpServers((prev) => [...prev, payload.server]);
                          setSelectedMcpServer(payload.server);
                          setMessage('MCPサーバーを追加しました');
                        } else {
                          const error = await res.json().catch(() => null);
                          setMessage(error?.error || 'MCPサーバー追加に失敗しました');
                        }
                      } catch (err) {
                        const message = err instanceof Error ? err.message : 'MCPサーバー追加中に予期しないエラーが発生しました';
                        setMessage(message);
                      } finally {
                        setSavingMcpServer(false);
                      }
                    })();
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ＋新規追加
                </button>
              </div>

              <div style={{ marginBottom: '14px', borderTop: '1px solid #ddd', paddingTop: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                  MCPサーバーをインポート
                </label>
                <input
                  type="text"
                  placeholder="http://localhost:8000/sse"
                  value={mcpImportUrl}
                  onChange={(e) => setMcpImportUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '11px',
                    marginBottom: '6px',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={handleImportMcpServer}
                  disabled={mcpImporting}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    backgroundColor: mcpImporting ? '#ccc' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: mcpImporting ? 'default' : 'pointer',
                    fontSize: '11px',
                  }}
                >
                  {mcpImporting ? '処理中...' : 'インポート'}
                </button>
                {mcpImportError && (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#b91c1c' }}>
                    {mcpImportError}
                  </div>
                )}
              </div>

              {mcpServersError && (
                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#b91c1c' }}>
                  {mcpServersError}
                </div>
              )}

              {mcpServers.length === 0 ? (
                <p style={{ color: '#777', fontSize: '12px' }}>MCPサーバー未登録</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {mcpServers.map((server) => (
                    <li key={server.id} style={{ marginBottom: '8px' }}>
                      <button
                        onClick={() => setSelectedMcpServer(server)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: 'none',
                          borderRadius: '4px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          backgroundColor: selectedMcpServer?.id === server.id ? '#0066cc' : '#f0f0f0',
                          color: selectedMcpServer?.id === server.id ? 'white' : 'black',
                          fontSize: '12px',
                          opacity: server.enabled ? 1 : 0.6,
                        }}
                      >
                        {server.name}
                        {server.isPreset ? ' 🔒' : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <main>
              <h2 style={{ marginTop: 0 }}>MCP管理</h2>

              {selectedMcpServer ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveMcpServer();
                  }}
                  style={{ maxWidth: '600px' }}
                >
                  {selectedMcpServer.isPreset && (
                    <div
                      style={{
                        marginBottom: '15px',
                        padding: '10px 12px',
                        borderRadius: '4px',
                        backgroundColor: '#eff6ff',
                        borderLeft: '4px solid #2563eb',
                        color: '#1e3a8a',
                        fontSize: '13px',
                        lineHeight: 1.6,
                      }}
                    >
                      このMCPサーバーはデフォルトプリセットです。設定の保存はできますが、削除はできません。
                    </div>
                  )}

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>サーバー名</label>
                    <input
                      type="text"
                      value={selectedMcpServer.name}
                      onChange={(e) => {
                        setSelectedMcpServer({ ...selectedMcpServer, name: e.target.value });
                      }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>説明</label>
                    <textarea
                      value={selectedMcpServer.description}
                      onChange={(e) => {
                        setSelectedMcpServer({ ...selectedMcpServer, description: e.target.value });
                      }}
                      rows={3}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>トランスポート</label>
                    <select
                      value={selectedMcpServer.transport}
                      onChange={(e) => {
                        const transport = e.target.value as 'stdio' | 'sse' | 'http';
                        setSelectedMcpServer({ ...selectedMcpServer, transport, config: {} });
                      }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    >
                      <option value="http">HTTP</option>
                      <option value="sse">SSE</option>
                      <option value="stdio">stdio</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>ルーティングモード</label>
                    <select
                      value={selectedMcpServer.mode || 'rule'}
                      onChange={(e) => {
                        setSelectedMcpServer({
                          ...selectedMcpServer,
                          mode: e.target.value as 'rule' | 'ai' | 'hybrid',
                        });
                      }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    >
                      <option value="rule">rule（キーワードルール）</option>
                      <option value="ai">ai（LLM判定）</option>
                      <option value="hybrid">hybrid（rule優先 + ai補完）</option>
                    </select>
                  </div>

                  {selectedMcpServer.transport === 'http' && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>サーバーURL</label>
                      <input
                        type="text"
                        value={selectedMcpServer.config.url || ''}
                        onChange={(e) => {
                          setSelectedMcpServer({
                            ...selectedMcpServer,
                            config: { ...selectedMcpServer.config, url: e.target.value },
                          });
                        }}
                        placeholder="http://localhost:8000"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}

                  {selectedMcpServer.transport === 'sse' && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>SSE URL</label>
                      <input
                        type="text"
                        value={selectedMcpServer.config.url || ''}
                        onChange={(e) => {
                          setSelectedMcpServer({
                            ...selectedMcpServer,
                            config: { ...selectedMcpServer.config, url: e.target.value },
                          });
                        }}
                        placeholder="http://localhost:8000/sse"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        onClick={handleUpdateMcpServerMetadata}
                        disabled={mcpImporting}
                        style={{
                          marginTop: '8px',
                          width: '100%',
                          padding: '8px',
                          backgroundColor: mcpImporting ? '#ccc' : '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: mcpImporting ? 'default' : 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        {mcpImporting ? '更新中...' : '🔄 設定を更新'}
                      </button>
                    </div>
                  )}

                  {selectedMcpServer.transport === 'stdio' && (
                    <>
                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>コマンド</label>
                        <input
                          type="text"
                          value={selectedMcpServer.config.command || ''}
                          onChange={(e) => {
                            setSelectedMcpServer({
                              ...selectedMcpServer,
                              config: { ...selectedMcpServer.config, command: e.target.value },
                            });
                          }}
                          placeholder="node"
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>引数 (JSON配列文字列)</label>
                        <input
                          type="text"
                          value={mcpStdioArgsInput}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            setMcpStdioArgsInput(nextValue);

                            try {
                              const args = JSON.parse(nextValue);
                              if (Array.isArray(args)) {
                                setMcpStdioArgsError('');
                                setSelectedMcpServer({
                                  ...selectedMcpServer,
                                  config: { ...selectedMcpServer.config, args },
                                });
                              } else {
                                setMcpStdioArgsError('JSON配列を入力してください（例: ["arg1", "arg2"]）');
                              }
                            } catch {
                              setMcpStdioArgsError('JSONの形式が正しくありません');
                            }
                          }}
                          placeholder='["/path/to/server.js"]'
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: `1px solid ${mcpStdioArgsError ? '#ef5350' : '#ddd'}`,
                            borderRadius: '4px',
                            boxSizing: 'border-box',
                          }}
                        />
                        {mcpStdioArgsError && (
                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#c62828' }}>
                            {mcpStdioArgsError}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div style={{ marginBottom: '15px', padding: '12px', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Rule Routing設定</div>

                    <label style={{ display: 'block', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedMcpServer.ruleRouting?.enabled ?? true}
                        onChange={(e) => {
                          setSelectedMcpServer({
                            ...selectedMcpServer,
                            ruleRouting: {
                              enabled: e.target.checked,
                              rules: selectedMcpServer.ruleRouting?.rules || [],
                            },
                          });
                        }}
                        style={{ marginRight: '8px' }}
                      />
                      Rule Routingを有効化
                    </label>

                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>ルール定義(JSON配列)</label>
                    <textarea
                      value={mcpRuleRoutingJsonInput}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setMcpRuleRoutingJsonInput(nextValue);

                        try {
                          const parsed = JSON.parse(nextValue);
                          if (Array.isArray(parsed)) {
                            setMcpRuleRoutingJsonError('');
                            setSelectedMcpServer({
                              ...selectedMcpServer,
                              ruleRouting: {
                                enabled: selectedMcpServer.ruleRouting?.enabled ?? true,
                                rules: parsed,
                              },
                            });
                          } else {
                            setMcpRuleRoutingJsonError('JSON配列を入力してください（例: [{...}]）');
                          }
                        } catch {
                          setMcpRuleRoutingJsonError('JSONの形式が正しくありません');
                        }
                      }}
                      rows={8}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: `1px solid ${mcpRuleRoutingJsonError ? '#ef5350' : '#ddd'}`,
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace',
                      }}
                    />
                    {mcpRuleRoutingJsonError && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#c62828' }}>
                        {mcpRuleRoutingJsonError}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '15px', padding: '12px', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>AI Routing設定</div>

                    {selectedMcpServer.id === 'google-workspace' && (
                      <div style={{ marginBottom: '10px', fontSize: '12px', color: '#b45309', lineHeight: 1.5 }}>
                        Google Workspace はドメイン側で明示的に有効化された場合のみ利用されます。
                        セッションの attach だけでは有効化されません。
                      </div>
                    )}

                    <label style={{ display: 'block', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedMcpServer.aiRouting?.enabled ?? false}
                        onChange={(e) => {
                          const nextEnabled = e.target.checked;
                          const currentAllowedTools = normalizeAllowedTools(selectedMcpServer.aiRouting?.allowedTools);
                          setMcpAiAllowedToolsError(validateAllowedTools(currentAllowedTools));

                          setSelectedMcpServer({
                            ...selectedMcpServer,
                            aiRouting: {
                              enabled: nextEnabled,
                              provider: selectedMcpServer.aiRouting?.provider || 'ollama',
                              model: selectedMcpServer.aiRouting?.model || 'qwen2.5:7b',
                              systemPrompt: selectedMcpServer.aiRouting?.systemPrompt || '',
                              temperature: selectedMcpServer.aiRouting?.temperature ?? 0.1,
                              maxTokens: selectedMcpServer.aiRouting?.maxTokens ?? 240,
                              confidenceThreshold: selectedMcpServer.aiRouting?.confidenceThreshold ?? 0.55,
                              allowedTools: selectedMcpServer.aiRouting?.allowedTools || [],
                              fallbackTool: selectedMcpServer.aiRouting?.fallbackTool,
                            },
                          });
                        }}
                        style={{ marginRight: '8px' }}
                      />
                      AI Routingを有効化
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Provider</label>
                        <select
                          value={selectedMcpServer.aiRouting?.provider || 'ollama'}
                          onChange={(e) => {
                            setSelectedMcpServer({
                              ...selectedMcpServer,
                              aiRouting: {
                                ...(selectedMcpServer.aiRouting || {
                                  enabled: false,
                                  model: 'qwen2.5:7b',
                                  systemPrompt: '',
                                  temperature: 0.1,
                                  maxTokens: 240,
                                  confidenceThreshold: 0.55,
                                  allowedTools: [],
                                }),
                                provider: e.target.value as 'ollama' | 'openai',
                              },
                            });
                          }}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                        >
                          <option value="ollama">ollama</option>
                          <option value="openai">openai</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Model</label>
                        <input
                          type="text"
                          value={selectedMcpServer.aiRouting?.model || ''}
                          onChange={(e) => {
                            setSelectedMcpServer({
                              ...selectedMcpServer,
                              aiRouting: {
                                ...(selectedMcpServer.aiRouting || {
                                  enabled: false,
                                  provider: 'ollama',
                                  systemPrompt: '',
                                  temperature: 0.1,
                                  maxTokens: 240,
                                  confidenceThreshold: 0.55,
                                  allowedTools: [],
                                }),
                                model: e.target.value,
                              },
                            });
                          }}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '10px' }}>
                        <label style={{ display: 'block', fontWeight: 'bold' }}>System Prompt</label>
                        <button
                          type="button"
                          onClick={handleGenerateMcpSystemPrompt}
                          disabled={generatingMcpSystemPrompt}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: generatingMcpSystemPrompt ? '#9ca3af' : '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: generatingMcpSystemPrompt ? 'default' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {generatingMcpSystemPrompt ? '生成中...' : 'Systemプロンプトを更新'}
                        </button>
                      </div>
                      <textarea
                        value={selectedMcpServer.aiRouting?.systemPrompt || ''}
                        onChange={(e) => {
                          setSelectedMcpServer({
                            ...selectedMcpServer,
                            aiRouting: {
                              ...(selectedMcpServer.aiRouting || {
                                enabled: false,
                                provider: 'ollama',
                                model: 'qwen2.5:7b',
                                temperature: 0.1,
                                maxTokens: 240,
                                confidenceThreshold: 0.55,
                                allowedTools: [],
                              }),
                              systemPrompt: e.target.value,
                            },
                          });
                        }}
                        rows={5}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Temperature</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={selectedMcpServer.aiRouting?.temperature ?? 0.1}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setSelectedMcpServer({
                              ...selectedMcpServer,
                              aiRouting: {
                                ...(selectedMcpServer.aiRouting || {
                                  enabled: false,
                                  provider: 'ollama',
                                  model: 'qwen2.5:7b',
                                  systemPrompt: '',
                                  maxTokens: 240,
                                  confidenceThreshold: 0.55,
                                  allowedTools: [],
                                }),
                                temperature: Number.isFinite(value) ? value : 0.1,
                              },
                            });
                          }}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Max Tokens</label>
                        <input
                          type="number"
                          min={32}
                          max={2000}
                          value={selectedMcpServer.aiRouting?.maxTokens ?? 240}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            setSelectedMcpServer({
                              ...selectedMcpServer,
                              aiRouting: {
                                ...(selectedMcpServer.aiRouting || {
                                  enabled: false,
                                  provider: 'ollama',
                                  model: 'qwen2.5:7b',
                                  systemPrompt: '',
                                  temperature: 0.1,
                                  confidenceThreshold: 0.55,
                                  allowedTools: [],
                                }),
                                maxTokens: Number.isNaN(value) ? 240 : value,
                              },
                            });
                          }}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Confidence閾値</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={selectedMcpServer.aiRouting?.confidenceThreshold ?? 0.55}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setSelectedMcpServer({
                              ...selectedMcpServer,
                              aiRouting: {
                                ...(selectedMcpServer.aiRouting || {
                                  enabled: false,
                                  provider: 'ollama',
                                  model: 'qwen2.5:7b',
                                  systemPrompt: '',
                                  temperature: 0.1,
                                  maxTokens: 240,
                                  allowedTools: [],
                                }),
                                confidenceThreshold: Number.isFinite(value) ? value : 0.55,
                              },
                            });
                          }}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <label style={{ display: 'block', fontWeight: 'bold' }}>Allowed Tools（タグ入力）</label>
                        <button
                          type="button"
                          onClick={applySearchAllowedToolsPreset}
                          style={{
                            padding: '4px 10px',
                            border: '1px solid #2563eb',
                            borderRadius: '4px',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          検索プリセット追加
                        </button>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: `1px solid ${mcpAiAllowedToolsError ? '#ef5350' : '#ddd'}`,
                          borderRadius: '4px',
                          boxSizing: 'border-box',
                          backgroundColor: '#fff',
                        }}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                          {(selectedMcpServer.aiRouting?.allowedTools || []).map((tool, index) => (
                            <span
                              key={`${tool}-${index}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: '#e3f2fd',
                                border: '1px solid #90caf9',
                                borderRadius: '12px',
                                padding: '2px 8px',
                                fontSize: '12px',
                              }}
                            >
                              {tool}
                              <button
                                type="button"
                                onClick={() => {
                                  const current = selectedMcpServer.aiRouting?.allowedTools || [];
                                  const next = current.filter((_, idx) => idx !== index);
                                  const normalized = normalizeAllowedTools(next);
                                  setMcpAiAllowedToolsError(
                                    validateAllowedTools(normalized)
                                  );

                                  setSelectedMcpServer({
                                    ...selectedMcpServer,
                                    aiRouting: {
                                      ...(selectedMcpServer.aiRouting || {
                                        enabled: false,
                                        provider: 'ollama',
                                        model: 'qwen2.5:7b',
                                        systemPrompt: '',
                                        temperature: 0.1,
                                        maxTokens: 240,
                                        confidenceThreshold: 0.55,
                                        allowedTools: [],
                                      }),
                                      allowedTools: normalized,
                                      fallbackTool:
                                        selectedMcpServer.aiRouting?.fallbackTool &&
                                        normalized.includes(selectedMcpServer.aiRouting.fallbackTool)
                                          ? selectedMcpServer.aiRouting.fallbackTool
                                          : undefined,
                                    },
                                  });
                                }}
                                style={{
                                  border: 'none',
                                  backgroundColor: 'transparent',
                                  cursor: 'pointer',
                                  color: '#1565c0',
                                  padding: 0,
                                  lineHeight: 1,
                                }}
                                aria-label="remove tool"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            value={mcpAiAllowedToolInput}
                            onChange={(e) => {
                              setMcpAiAllowedToolInput(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter' && e.key !== ',') {
                                return;
                              }
                              e.preventDefault();

                              const candidate = mcpAiAllowedToolInput.trim();
                              if (!candidate) {
                                return;
                              }

                              const current = normalizeAllowedTools(selectedMcpServer.aiRouting?.allowedTools);
                              if (current.includes(candidate)) {
                                setMcpAiAllowedToolsError('Allowed Toolsに重複があります');
                                return;
                              }

                              const next = [...current, candidate];
                              setMcpAiAllowedToolInput('');
                              setMcpAiAllowedToolsError(
                                validateAllowedTools(next)
                              );
                              setSelectedMcpServer({
                                ...selectedMcpServer,
                                aiRouting: {
                                  ...(selectedMcpServer.aiRouting || {
                                    enabled: false,
                                    provider: 'ollama',
                                    model: 'qwen2.5:7b',
                                    systemPrompt: '',
                                    temperature: 0.1,
                                    maxTokens: 240,
                                    confidenceThreshold: 0.55,
                                    allowedTools: [],
                                  }),
                                  allowedTools: next,
                                  fallbackTool:
                                    selectedMcpServer.aiRouting?.fallbackTool &&
                                    next.includes(selectedMcpServer.aiRouting.fallbackTool)
                                      ? selectedMcpServer.aiRouting.fallbackTool
                                      : undefined,
                                },
                              });
                            }}
                            placeholder="tool名を入力して Enter"
                            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const candidate = mcpAiAllowedToolInput.trim();
                              if (!candidate) {
                                return;
                              }

                              const current = normalizeAllowedTools(selectedMcpServer.aiRouting?.allowedTools);
                              if (current.includes(candidate)) {
                                setMcpAiAllowedToolsError('Allowed Toolsに重複があります');
                                return;
                              }

                              const next = [...current, candidate];
                              setMcpAiAllowedToolInput('');
                              setMcpAiAllowedToolsError(
                                validateAllowedTools(next)
                              );
                              setSelectedMcpServer({
                                ...selectedMcpServer,
                                aiRouting: {
                                  ...(selectedMcpServer.aiRouting || {
                                    enabled: false,
                                    provider: 'ollama',
                                    model: 'qwen2.5:7b',
                                    systemPrompt: '',
                                    temperature: 0.1,
                                    maxTokens: 240,
                                    confidenceThreshold: 0.55,
                                    allowedTools: [],
                                  }),
                                  allowedTools: next,
                                  fallbackTool:
                                    selectedMcpServer.aiRouting?.fallbackTool &&
                                    next.includes(selectedMcpServer.aiRouting.fallbackTool)
                                      ? selectedMcpServer.aiRouting.fallbackTool
                                      : undefined,
                                },
                              });
                            }}
                            style={{
                              padding: '8px 12px',
                              border: 'none',
                              borderRadius: '4px',
                              backgroundColor: '#2563eb',
                              color: 'white',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                            }}
                          >
                            追加
                          </button>
                        </div>
                      </div>
                      {mcpAiAllowedToolsError && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#c62828' }}>
                          {mcpAiAllowedToolsError}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Fallback Tool（任意）</label>
                      <select
                        value={
                          selectedMcpServer.aiRouting?.fallbackTool &&
                          (selectedMcpServer.aiRouting?.allowedTools || []).includes(selectedMcpServer.aiRouting.fallbackTool)
                            ? selectedMcpServer.aiRouting.fallbackTool
                            : ''
                        }
                        onChange={(e) => {
                          setSelectedMcpServer({
                            ...selectedMcpServer,
                            aiRouting: {
                              ...(selectedMcpServer.aiRouting || {
                                enabled: false,
                                provider: 'ollama',
                                model: 'qwen2.5:7b',
                                systemPrompt: '',
                                temperature: 0.1,
                                maxTokens: 240,
                                confidenceThreshold: 0.55,
                                allowedTools: [],
                              }),
                              fallbackTool: e.target.value || undefined,
                            },
                          });
                        }}
                        disabled={(selectedMcpServer.aiRouting?.allowedTools || []).length === 0}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                      >
                        <option value="">未設定</option>
                        {(selectedMcpServer.aiRouting?.allowedTools || []).map((tool) => (
                          <option key={tool} value={tool}>
                            {tool}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>タイムアウト (ミリ秒)</label>
                    <input
                      type="number"
                      value={selectedMcpServer.timeout}
                      onChange={(e) => {
                        setSelectedMcpServer({
                          ...selectedMcpServer,
                          timeout: Math.max(1000, parseInt(e.target.value, 10) || 30000),
                        });
                      }}
                      min={1000}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedMcpServer.enabled}
                        onChange={(e) => {
                          setSelectedMcpServer({ ...selectedMcpServer, enabled: e.target.checked });
                        }}
                        style={{ marginRight: '8px' }}
                      />
                      有効
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <button
                      type="submit"
                      disabled={savingMcpServer || isMcpSaveBlockedByAiAllowedTools}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: savingMcpServer || isMcpSaveBlockedByAiAllowedTools ? '#ccc' : '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: savingMcpServer || isMcpSaveBlockedByAiAllowedTools ? 'default' : 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      {savingMcpServer ? '保存中...' : '保存'}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await handleTestMcpConnection(selectedMcpServer.id);
                      }}
                      disabled={mcpTestBusy === selectedMcpServer.id}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: mcpTestBusy === selectedMcpServer.id ? '#ccc' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: mcpTestBusy === selectedMcpServer.id ? 'default' : 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      {mcpTestBusy === selectedMcpServer.id ? 'テスト中...' : '接続テスト'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteMcpServer(selectedMcpServer.id)}
                      disabled={selectedMcpServer.isPreset}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: selectedMcpServer.isPreset ? '#ccc' : '#ef5350',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: selectedMcpServer.isPreset ? 'default' : 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      {selectedMcpServer.isPreset ? '削除不可' : '削除'}
                    </button>
                  </div>

                  {mcpTestResults[selectedMcpServer.id] && (
                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '4px',
                        backgroundColor: mcpTestResults[selectedMcpServer.id].success ? '#e8f5e9' : '#ffebee',
                        borderLeft: `4px solid ${mcpTestResults[selectedMcpServer.id].success ? '#4caf50' : '#ef5350'}`,
                        marginBottom: '15px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {mcpTestResults[selectedMcpServer.id].success ? '✓ 接続成功' : '✗ 接続失敗'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#555' }}>
                        {mcpTestResults[selectedMcpServer.id].message}
                      </div>
                      {mcpTestResults[selectedMcpServer.id].latency && (
                        <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>
                          応答時間: {mcpTestResults[selectedMcpServer.id].latency}ms
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>サーバー情報</div>
                    <div style={{ fontSize: '12px', color: '#666', whiteSpace: 'pre-wrap' }}>
                      ID: {selectedMcpServer.id}
                      {`\n`}作成日時: {new Date(selectedMcpServer.createdAt).toLocaleString('ja-JP')}
                      {`\n`}更新日時: {new Date(selectedMcpServer.updatedAt).toLocaleString('ja-JP')}
                    </div>
                  </div>

                  <div style={{ padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px', marginTop: '10px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>最終ランタイム実行</div>

                    {!selectedMcpServer.lastRuntimeAt ? (
                      <div style={{ fontSize: '12px', color: '#666' }}>まだ実行履歴がありません</div>
                    ) : (
                      <>
                        <div style={{ fontSize: '12px', color: '#666', whiteSpace: 'pre-wrap' }}>
                          実行時刻: {new Date(selectedMcpServer.lastRuntimeAt).toLocaleString('ja-JP')}
                          {`\n`}ツール: {selectedMcpServer.lastRuntimeToolName || '(未記録)'}
                        </div>

                        <div
                          style={{
                            marginTop: '8px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: selectedMcpServer.lastRuntimeSuccess ? '#2e7d32' : '#c62828',
                          }}
                        >
                          {selectedMcpServer.lastRuntimeSuccess ? '✓ 成功' : '✗ 失敗'}
                        </div>

                        {!selectedMcpServer.lastRuntimeSuccess && selectedMcpServer.lastRuntimeError && (
                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#c62828', whiteSpace: 'pre-wrap' }}>
                            {selectedMcpServer.lastRuntimeError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </form>
              ) : (
                <p>MCPサーバーを選択するか、新規追加してください</p>
              )}
            </main>
          </>
        ) : null}
      </div>
    </div>
  );
}
