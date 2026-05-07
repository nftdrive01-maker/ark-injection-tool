'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toKana } from 'wanakana';

interface Domain {
  id: string;
  name: string;
  description: string;
  baseSystemPrompt: string;
  baseContext: string;
  bgUrl?: string;
  characterName?: string;
  vrmUrl?: string;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  knowledgeIds: string[];
  mcpServerIds?: string[];
  systemPrompt: string;
  context: string;
  version: string;
  ttl: number;
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

interface PublicManagementSettings {
  maxConcurrentSessions: number;
}

interface MCPServer {
  id: string;
  name: string;
  description: string;
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

const DANGER_LINE_PERCENT = 90;
const WARNING_LINE_PERCENT = 75;
const SELECTED_DOMAIN_STORAGE_KEY = 'arki_selected_domain_id';
const LATIN_WORD_PATTERN = /https?:\/\/\S+|www\.\S+|[A-Za-z][A-Za-z'-]*/g;

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

export default function AdminPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [knowledges, setKnowledges] = useState<Knowledge[]>([]);
  const [pronunciations, setPronunciations] = useState<PronunciationRule[]>([]);
  const [pronunciationSettings, setPronunciationSettings] = useState<PronunciationSettings>({
    wanaKanaEnabled: false,
  });
  const [activeTab, setActiveTab] = useState<'domain' | 'knowledge' | 'asset' | 'pronunciation' | 'public' | 'mcp'>('domain');
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [selectedPronunciation, setSelectedPronunciation] = useState<PronunciationRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [savingPronunciation, setSavingPronunciation] = useState(false);
  const [savingPronunciationSettings, setSavingPronunciationSettings] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [message, setMessage] = useState('');
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
  const [publicSettings, setPublicSettings] = useState<PublicManagementSettings>({ maxConcurrentSessions: 0 });
  const [savingPublicSettings, setSavingPublicSettings] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<AssetType | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<AssetType | null>(null);
  const sbv2PreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const sbv2PreviewUrlRef = useRef<string | null>(null);

  // MCP Server Management
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<MCPServer | null>(null);
  const [savingMcpServer, setSavingMcpServer] = useState(false);
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

  const normalizeAllowedTools = (tools: string[] | undefined): string[] => {
    if (!Array.isArray(tools)) {
      return [];
    }

    return tools
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  };

  const validateAllowedTools = (tools: string[], aiEnabled: boolean): string => {
    const uniqueCount = new Set(tools).size;
    if (uniqueCount !== tools.length) {
      return 'Allowed Toolsに重複があります';
    }

    if (aiEnabled && tools.length === 0) {
      return 'AI Routing有効時はAllowed Toolsを1つ以上設定してください';
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
    setMcpAiAllowedToolsError(validateAllowedTools(next, selectedMcpServer.aiRouting?.enabled ?? false));
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

  const loadAllData = async (token: string) => {
    const [domainsRes, knowledgesRes, pronunciationsRes, pronunciationSettingsRes] = await Promise.all([
      fetch('/api/domains', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/knowledges', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/pronunciations', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/pronunciations/settings', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (domainsRes.ok) {
      const domainData = await domainsRes.json();
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

    if (
      domainsRes.status === 401 ||
      knowledgesRes.status === 401 ||
      pronunciationsRes.status === 401 ||
      pronunciationSettingsRes.status === 401
    ) {
      localStorage.removeItem('injection_token');
      window.location.href = '/login';
      return;
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

  const loadAssetFiles = async (token: string, type: AssetType): Promise<AssetFile[]> => {
    const response = await fetch(`/api/assets?type=${type}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${type} assets`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.files)) {
      return [];
    }

    return payload.files
      .filter((item: any) => item && typeof item.name === 'string' && typeof item.url === 'string')
      .map((item: any) => ({ name: item.name, url: item.url }));
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
        .filter((item: any) => item && typeof item.id === 'string')
        .map((item: any) => ({
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

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      setPublicSettings({
        maxConcurrentSessions:
          typeof payload?.maxConcurrentSessions === 'number' && Number.isFinite(payload.maxConcurrentSessions)
            ? Math.max(0, Math.floor(payload.maxConcurrentSessions))
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
        const aiValidationError = validateAllowedTools(normalizedAllowedTools, aiRouting.enabled);
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

  const handleDeleteMcpServer = async (serverId: string) => {
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

      setMcpServers((prev) => prev.filter((s) => s.id !== serverId));
      if (selectedMcpServer?.id === serverId) {
        setSelectedMcpServer(mcpServers[0] || null);
      }
      setMessage('MCPサーバーを削除しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MCPサーバーの削除中にエラーが発生しました';
      setMessage(message);
    }
  };

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
      });
      setMessage('公開管理設定を保存しました');
    } catch (err) {
      setMessage('公開管理設定の保存中にエラーが発生しました');
    } finally {
      setSavingPublicSettings(false);
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
      } catch (err) {
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

      setMessage(`${type === 'vrm' ? 'VRM' : '背景画像'}をアップロードしました`);
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

      setMessage(`${type === 'vrm' ? 'VRM' : '背景画像'}を削除しました`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('ファイル削除時にエラーが発生しました');
    } finally {
      setDeletingAsset(null);
    }
  };

  useEffect(() => {
    // 認証チェック
    const token = localStorage.getItem('injection_token');
    if (!token) {
      window.location.href = '/login';
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

    const aiEnabled = selectedMcpServer.aiRouting?.enabled ?? false;
    const normalizedTools = normalizeAllowedTools(selectedMcpServer.aiRouting?.allowedTools);
    setMcpAiAllowedToolInput('');
    setMcpAiAllowedToolsError(validateAllowedTools(normalizedTools, aiEnabled));
  }, [selectedMcpServer?.id]);

  const handleSave = async () => {
    if (!selectedDomain) return;

    setSaving(true);
    setMessage('');

    try {
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
        const updatedDomain = await res.json();
        setDomains((prev) => prev.map((domain) => (domain.id === updatedDomain.id ? updatedDomain : domain)));
        setSelectedDomain(updatedDomain);
        setMessage('保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('保存に失敗しました');
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
        const created = await res.json();
        setDomains((prev) => [...prev, created]);
        setSelectedDomain(created);
        setMessage('ドメインを追加しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(error.error || 'ドメイン追加に失敗しました');
      }
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      setMessage('ナレッジ追加時にエラーが発生しました');
      console.error(err);
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
    const from = window.prompt('変換前の文字列（例: 小海町）を入力してください');
    if (!from || from.trim() === '') {
      return;
    }

    const to = window.prompt('変換後の読み（例: コウミまち）を入力してください');
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
    } catch (err) {
      console.error(err);
      setMessage('バックアップ保存時にエラーが発生しました');
    } finally {
      setBackupBusy(false);
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

  const isMcpSaveBlockedByAiAllowedTools = Boolean(
    selectedMcpServer &&
    selectedMcpServer.mode === 'ai' &&
    (selectedMcpServer.aiRouting?.allowedTools || []).length === 0
  );

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
                        {domain.name}
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
              >
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

                <div style={{ marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fafafa' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Amica アセット/TTS 上書き（ドメイン別）</div>

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
                        placeholder="空欄なら Amica 側の既定名を使用"
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
                        背景画像 URL
                      </label>
                      <input
                        type="text"
                        value={selectedDomain.bgUrl || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, bgUrl: e.target.value })
                        }
                        placeholder="空欄なら Amica 側の既定背景を使用"
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
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      VRM URL
                    </label>
                    <input
                      type="text"
                      value={selectedDomain.vrmUrl || ''}
                      onChange={(e) =>
                        setSelectedDomain({ ...selectedDomain, vrmUrl: e.target.value })
                      }
                      placeholder="空欄なら Amica 側の既定VRMを使用"
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
                        <option value="">未設定（Amica既定）</option>
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
                    空欄ならドメイン切替時に Amica の既定設定へ戻します。
                  </div>
                </div>

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
        ) : activeTab === 'asset' ? (
          <>
            <aside style={{ borderRight: '1px solid #ddd', paddingRight: '20px' }}>
              <h3>アセット</h3>
              <div style={{ marginBottom: '8px', fontSize: '13px', color: '#444' }}>
                VRM: <strong>{vrmAssets.length}</strong>
              </div>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#444' }}>
                背景画像: <strong>{bgImageAssets.length}</strong>
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
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>背景画像（bgimage）</div>
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
                    {uploadingAsset === 'bgimage' ? 'アップロード中...' : '背景画像をアップロード'}
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
                    <div style={{ padding: '10px', color: '#666' }}>背景画像がありません</div>
                  ) : (
                    bgImageAssets.map((asset) => (
                      <div key={asset.url} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '10px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                          <div style={{ fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.url}</div>
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

                    <label style={{ display: 'block', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedMcpServer.aiRouting?.enabled ?? false}
                        onChange={(e) => {
                          const nextEnabled = e.target.checked;
                          const currentAllowedTools = normalizeAllowedTools(selectedMcpServer.aiRouting?.allowedTools);
                          setMcpAiAllowedToolsError(validateAllowedTools(currentAllowedTools, nextEnabled));

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
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>System Prompt</label>
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
                                    validateAllowedTools(normalized, selectedMcpServer.aiRouting?.enabled ?? false)
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
                                validateAllowedTools(next, selectedMcpServer.aiRouting?.enabled ?? false)
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
                                validateAllowedTools(next, selectedMcpServer.aiRouting?.enabled ?? false)
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
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#ef5350',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      削除
                    </button>
                  </div>

                  {isMcpSaveBlockedByAiAllowedTools && (
                    <div style={{ marginTop: '-10px', marginBottom: '12px', fontSize: '12px', color: '#c62828' }}>
                      mode が ai の場合は Allowed Tools を1つ以上設定してください
                    </div>
                  )}

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
