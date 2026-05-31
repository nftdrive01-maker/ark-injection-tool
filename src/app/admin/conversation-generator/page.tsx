'use client';

import { useEffect, useMemo, useState } from 'react';

type ConversationGenerationMode = 'knowledge-only' | 'attach-domain' | 'create-domain';

interface Domain {
  id: string;
  name: string;
  description: string;
  knowledgeIds: string[];
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
}

interface DomainSharedLogRecord {
  id: number;
  domainId: string;
  requestId: string;
  sessionId: string | null;
  userId: string;
  userText: string;
  requestBody: unknown;
  responseBody: unknown;
  mcpResult: unknown;
  chronicleResult: unknown;
  createdAt: string;
  mcpUsed: boolean;
  mcpToolName?: string;
  chronicleUsed: boolean;
}

interface ConversationGenerationDraft {
  knowledge: {
    name: string;
    description: string;
    systemPrompt: string;
    context: string;
    priority: number;
  };
  domain: {
    name: string;
    description: string;
    characterName: string;
    baseSystemPrompt: string;
    baseContext: string;
    themeColor: string;
  };
  provider: 'ollama' | 'openai';
  model: string;
}

interface ConversationGenerationResponse {
  success: boolean;
  knowledge: {
    id: string;
    name: string;
  };
  domain: Domain | null;
  generator?: {
    provider: 'ollama' | 'openai';
    model: string;
  };
}

interface ConversationGenerationPreviewResponse {
  success: boolean;
  preview: ConversationGenerationDraft;
  generator?: {
    provider: 'ollama' | 'openai';
    model: string;
  };
}

interface ConversationGenerationTemplate {
  id: string;
  label: string;
  description: string;
  instructions: string;
}

const CONVERSATION_GENERATION_TEMPLATES: ConversationGenerationTemplate[] = [
  {
    id: 'generic-concierge',
    label: '汎用コンシェルジュ',
    description: '一般的な案内・相談ドメイン向けにまとめます。',
    instructions: '汎用コンシェルジュとして再利用しやすい knowledge と domain を作る。案内・質問応答・運用補助を想定し、曖昧な情報は未確認として扱う。',
  },
  {
    id: 'company-concierge',
    label: '企業案内',
    description: '会社概要、製品、導入相談、問い合わせ向けです。',
    instructions: '企業案内ドメインとして使えるように整理する。会社情報、製品サービス、問い合わせ、導入相談、採用案内に向く knowledge/context を優先する。',
  },
  {
    id: 'school-concierge',
    label: '学校案内',
    description: '学校紹介、入試、行事案内向けです。',
    instructions: '学校案内ドメインとして使えるように整理する。受験生、保護者、在校生向けの案内、行事、教室、窓口、提出物などを優先して構造化する。',
  },
  {
    id: 'public-concierge',
    label: '行政・公共案内',
    description: '手続き、制度、窓口案内向けです。',
    instructions: '自治体や公共窓口ドメインとして使えるように整理する。手続き、必要書類、受付時間、窓口、制度概要を優先し、法的判断は避ける方針を含める。',
  },
  {
    id: 'arki-help',
    label: 'Ark-i ヘルプ',
    description: 'Ark-i の構成、運用、設定、公開支援向けです。',
    instructions: 'Ark-i のヘルプ・運用支援ドメインとして使えるように整理する。構成理解、起動停止、設定、MCP連携、外部公開、トラブルシューティングを優先してまとめる。',
  },
];

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

function summarizeSharedLogResponseBody(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const candidate = value as Record<string, unknown>;
  for (const key of ['answer', 'message', 'text', 'response']) {
    if (typeof candidate[key] === 'string' && String(candidate[key]).trim()) {
      return String(candidate[key]).trim();
    }
  }

  if (candidate.answer && typeof candidate.answer === 'object') {
    const nested = candidate.answer as Record<string, unknown>;
    if (typeof nested.body === 'string' && nested.body.trim()) {
      return nested.body.trim();
    }
  }

  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 1200 ? `${json.slice(0, 1200)}...` : json;
  } catch {
    return '';
  }
}

function serializeChatHistoryForGeneration(items: SharedLogEntry[], domains: Domain[]): string {
  return items
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((item) => {
      const domain = domains.find((entry) => entry.id === item.domainId);
      return [
        `[${formatAdminTimestamp(item.createdAt)}]`,
        `ドメイン: ${domain?.name || item.domainId}`,
        `役割: ${formatSharedLogRoleLabel(item.role)}`,
        `内容: ${item.content}`,
      ].join('\n');
    })
    .join('\n\n');
}

function serializeSharedLogRecordsForGeneration(logs: DomainSharedLogRecord[], domains: Domain[]): string {
  return logs
    .slice()
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((log) => {
      const domain = domains.find((entry) => entry.id === log.domainId);
      const assistantText = summarizeSharedLogResponseBody(log.responseBody);
      const lines = [
        `[${new Date(log.createdAt).toLocaleString('ja-JP')}]`,
        `ドメイン: ${domain?.name || log.domainId}`,
        `ユーザー: ${log.userId || '-'}`,
        `入力: ${log.userText}`,
      ];

      if (assistantText) {
        lines.push(`応答: ${assistantText}`);
      }
      if (log.mcpUsed) {
        lines.push(`MCP利用: ${log.mcpToolName || 'あり'}`);
      }
      if (log.chronicleUsed) {
        lines.push('CHRONICLE利用: あり');
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

export default function ConversationGeneratorPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [conversationGenerationInput, setConversationGenerationInput] = useState('');
  const [conversationGenerationMode, setConversationGenerationMode] = useState<ConversationGenerationMode>('knowledge-only');
  const [conversationGenerationAttachDomainId, setConversationGenerationAttachDomainId] = useState('');
  const [conversationGenerationKnowledgeName, setConversationGenerationKnowledgeName] = useState('');
  const [conversationGenerationDomainName, setConversationGenerationDomainName] = useState('');
  const [conversationGenerationBusy, setConversationGenerationBusy] = useState(false);
  const [conversationGenerationError, setConversationGenerationError] = useState('');
  const [conversationGenerationSuccess, setConversationGenerationSuccess] = useState('');
  const [conversationGenerationTemplateId, setConversationGenerationTemplateId] = useState<string>(CONVERSATION_GENERATION_TEMPLATES[0].id);
  const [conversationGenerationPreview, setConversationGenerationPreview] = useState<ConversationGenerationDraft | null>(null);
  const [conversationImportBusy, setConversationImportBusy] = useState(false);
  const [conversationImportError, setConversationImportError] = useState('');
  const [conversationImportStatus, setConversationImportStatus] = useState('');
  const [conversationImportDomainId, setConversationImportDomainId] = useState('');
  const [conversationImportUserId, setConversationImportUserId] = useState('');
  const [conversationImportSessionId, setConversationImportSessionId] = useState('');
  const [conversationImportLimit, setConversationImportLimit] = useState(30);

  const selectedConversationGenerationTemplate = useMemo(() => (
    CONVERSATION_GENERATION_TEMPLATES.find((template) => template.id === conversationGenerationTemplateId)
    || CONVERSATION_GENERATION_TEMPLATES[0]
  ), [conversationGenerationTemplateId]);

  useEffect(() => {
    let cancelled = false;

    const loadDomains = async () => {
      const token = localStorage.getItem('injection_token');
      if (!token) {
        window.location.replace('/login');
        return;
      }

      try {
        setLoading(true);
        setLoadError('');
        const response = await fetch('/api/domains', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (response.status === 401) {
          localStorage.removeItem('injection_token');
          window.location.replace('/login');
          return;
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          if (!cancelled) {
            setLoadError(payload?.error || 'ドメイン一覧の取得に失敗しました');
          }
          return;
        }

        if (!cancelled) {
          setDomains(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '初期データの取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDomains();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetConversationGenerationMessages = () => {
    setConversationGenerationError('');
    setConversationGenerationSuccess('');
  };

  const handlePreviewConversationGeneration = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setConversationGenerationError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (conversationGenerationInput.trim().length < 20) {
      setConversationGenerationError('会話内容をもう少し詳しく入力してください');
      return;
    }

    if (conversationGenerationMode === 'attach-domain' && !conversationGenerationAttachDomainId) {
      setConversationGenerationError('アタッチ先ドメインを選択してください');
      return;
    }

    setConversationGenerationBusy(true);
    resetConversationGenerationMessages();

    try {
      const response = await fetch('/api/knowledges/from-conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'preview',
          conversation: conversationGenerationInput,
          mode: conversationGenerationMode,
          attachDomainId: conversationGenerationMode === 'attach-domain' ? conversationGenerationAttachDomainId : undefined,
          knowledgeNameHint: conversationGenerationKnowledgeName.trim() || undefined,
          domainNameHint: conversationGenerationMode === 'create-domain' ? (conversationGenerationDomainName.trim() || undefined) : undefined,
          templateLabel: selectedConversationGenerationTemplate.label,
          templateInstructions: selectedConversationGenerationTemplate.instructions,
        }),
      });

      const payload = await response.json().catch(() => null) as ConversationGenerationPreviewResponse | { error?: string } | null;
      if (!response.ok || !payload || !('preview' in payload)) {
        setConversationGenerationError(payload && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : '会話からのプレビュー生成に失敗しました');
        return;
      }

      setConversationGenerationPreview(payload.preview);
      const generatorText = payload.generator ? ` (${payload.generator.provider}: ${payload.generator.model})` : '';
      setConversationGenerationSuccess(`プレビュー生成完了${generatorText}`);
    } catch (error) {
      setConversationGenerationError(error instanceof Error ? error.message : '会話からのプレビュー生成中にエラーが発生しました');
    } finally {
      setConversationGenerationBusy(false);
    }
  };

  const handleSaveConversationGeneration = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setConversationGenerationError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    if (!conversationGenerationPreview) {
      setConversationGenerationError('先にプレビューを生成してください');
      return;
    }

    setConversationGenerationBusy(true);
    resetConversationGenerationMessages();

    try {
      const response = await fetch('/api/knowledges/from-conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create',
          conversation: conversationGenerationInput,
          mode: conversationGenerationMode,
          attachDomainId: conversationGenerationMode === 'attach-domain' ? conversationGenerationAttachDomainId : undefined,
          draft: conversationGenerationPreview,
        }),
      });

      const payload = await response.json().catch(() => null) as ConversationGenerationResponse | { error?: string } | null;
      if (!response.ok || !payload || !('knowledge' in payload)) {
        setConversationGenerationError(payload && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : '会話からの保存に失敗しました');
        return;
      }

      const domainText = payload.domain
        ? conversationGenerationMode === 'attach-domain'
          ? ` / ドメイン「${payload.domain.name}」へアタッチしました`
          : ` / ドメイン「${payload.domain.name}」を作成しました`
        : '';
      const generatorText = payload.generator
        ? ` (${payload.generator.provider}: ${payload.generator.model})`
        : '';

      setConversationGenerationSuccess(`保存完了: ナレッジ「${payload.knowledge.name}」${domainText}${generatorText}`);
      setConversationGenerationPreview(null);
      if (payload.domain) {
        setDomains((prev) => {
          const exists = prev.some((domain) => domain.id === payload.domain?.id);
          if (exists) {
            return prev.map((domain) => (domain.id === payload.domain?.id ? payload.domain as Domain : domain));
          }
          return [...prev, payload.domain as Domain];
        });
      }
    } catch (error) {
      setConversationGenerationError(error instanceof Error ? error.message : '会話からの保存中にエラーが発生しました');
    } finally {
      setConversationGenerationBusy(false);
    }
  };

  const handleLoadConversationFromChatHistory = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setConversationImportError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    setConversationImportBusy(true);
    setConversationImportError('');
    setConversationImportStatus('');

    try {
      const params = new URLSearchParams();
      if (conversationImportDomainId) {
        params.set('domainId', conversationImportDomainId);
      }
      if (conversationImportUserId.trim()) {
        params.set('userId', conversationImportUserId.trim());
      }
      if (conversationImportSessionId.trim()) {
        params.set('sessionId', conversationImportSessionId.trim());
      }
      params.set('limit', String(conversationImportLimit));
      params.set('all', 'true');

      const response = await fetch(`/api/domain-chat-history?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (response.status === 401) {
        localStorage.removeItem('injection_token');
        window.location.replace('/login');
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setConversationImportError(payload?.error || 'チャット履歴の取得に失敗しました');
        return;
      }

      const items = Array.isArray(payload?.items) ? payload.items as SharedLogEntry[] : [];
      if (items.length === 0) {
        setConversationImportError('該当するチャット履歴がありません');
        return;
      }

      setConversationGenerationInput(serializeChatHistoryForGeneration(items, domains));
      setConversationGenerationPreview(null);
      setConversationImportStatus(`チャット履歴 ${items.length} 件を会話欄へ取り込みました`);
      resetConversationGenerationMessages();
    } catch (error) {
      setConversationImportError(error instanceof Error ? error.message : 'チャット履歴の取り込み中にエラーが発生しました');
    } finally {
      setConversationImportBusy(false);
    }
  };

  const handleLoadConversationFromSharedLogs = async () => {
    const token = localStorage.getItem('injection_token');
    if (!token) {
      setConversationImportError('認証情報が見つかりません。再ログインしてください');
      return;
    }

    setConversationImportBusy(true);
    setConversationImportError('');
    setConversationImportStatus('');

    try {
      const params = new URLSearchParams();
      if (conversationImportDomainId) {
        params.set('domainId', conversationImportDomainId);
      }
      params.set('limit', String(conversationImportLimit));

      const response = await fetch(`/api/domain-shared-logs?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (response.status === 401) {
        localStorage.removeItem('injection_token');
        window.location.replace('/login');
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setConversationImportError(payload?.error || '共有ログの取得に失敗しました');
        return;
      }

      const logs = Array.isArray(payload?.logs) ? payload.logs as DomainSharedLogRecord[] : [];
      if (logs.length === 0) {
        setConversationImportError('該当する共有ログがありません');
        return;
      }

      setConversationGenerationInput(serializeSharedLogRecordsForGeneration(logs, domains));
      setConversationGenerationPreview(null);
      setConversationImportStatus(`共有ログ ${logs.length} 件を会話欄へ取り込みました`);
      resetConversationGenerationMessages();
    } catch (error) {
      setConversationImportError(error instanceof Error ? error.message : '共有ログの取り込み中にエラーが発生しました');
    } finally {
      setConversationImportBusy(false);
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: 'linear-gradient(180deg, #eef4ff 0%, #f8fafc 100%)', padding: '24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gap: '20px' }}>
        <section style={{ backgroundColor: '#fff', border: '1px solid #dbe4f0', borderRadius: '18px', padding: '24px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em', color: '#4f46e5', textTransform: 'uppercase' }}>Admin Workspace</div>
              <h1 style={{ margin: '8px 0 8px 0', fontSize: '32px', lineHeight: 1.2, color: '#0f172a' }}>会話からナレッジ / ドメイン生成</h1>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.8, maxWidth: '760px' }}>
                会話ログ、要件メモ、共有ログから再利用可能な knowledge と domain を生成します。テンプレート選択、プレビュー編集、保存までを専用ワークフローとしてまとめています。
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href="/admin" style={{ textDecoration: 'none', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#e2e8f0', color: '#0f172a', fontWeight: 700 }}>
                管理画面へ戻る
              </a>
              <a href="/admin#knowledge" style={{ textDecoration: 'none', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#ede9fe', color: '#5b21b6', fontWeight: 700 }}>
                ナレッジ管理へ
              </a>
            </div>
          </div>
        </section>

        {loading ? (
          <section style={{ backgroundColor: '#fff', border: '1px solid #dbe4f0', borderRadius: '18px', padding: '24px' }}>読み込み中です...</section>
        ) : loadError ? (
          <section style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '18px', padding: '24px', color: '#be123c' }}>{loadError}</section>
        ) : (
          <section style={{ backgroundColor: '#fff', border: '1px solid #dbe4f0', borderRadius: '18px', padding: '24px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' }}>
            <div style={{ marginBottom: '10px', fontWeight: 700, color: '#0f172a' }}>会話ソースを読み込む</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px', gap: '8px', marginBottom: '8px' }}>
              <select value={conversationImportDomainId} onChange={(e) => { setConversationImportDomainId(e.target.value); setConversationImportError(''); setConversationImportStatus(''); }} disabled={conversationImportBusy || conversationGenerationBusy} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }}>
                <option value="">全ドメイン</option>
                {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name} ({domain.id})</option>)}
              </select>
              <input value={conversationImportUserId} onChange={(e) => { setConversationImportUserId(e.target.value); setConversationImportError(''); setConversationImportStatus(''); }} placeholder="userId で絞る（任意）" disabled={conversationImportBusy || conversationGenerationBusy} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
              <input value={conversationImportSessionId} onChange={(e) => { setConversationImportSessionId(e.target.value); setConversationImportError(''); setConversationImportStatus(''); }} placeholder="sessionId で絞る（任意）" disabled={conversationImportBusy || conversationGenerationBusy} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
              <input type="number" min={1} max={100} step={1} value={conversationImportLimit} onChange={(e) => { const next = Number.parseInt(e.target.value, 10); setConversationImportLimit(Number.isFinite(next) ? Math.max(1, Math.min(100, next)) : 30); setConversationImportError(''); setConversationImportStatus(''); }} disabled={conversationImportBusy || conversationGenerationBusy} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
              <button type="button" onClick={handleLoadConversationFromChatHistory} disabled={conversationImportBusy || conversationGenerationBusy} style={{ padding: '10px 14px', backgroundColor: conversationImportBusy ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', cursor: conversationImportBusy ? 'default' : 'pointer', fontWeight: 700 }}>チャット履歴を読み込む</button>
              <button type="button" onClick={handleLoadConversationFromSharedLogs} disabled={conversationImportBusy || conversationGenerationBusy} style={{ padding: '10px 14px', backgroundColor: conversationImportBusy ? '#94a3b8' : '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', cursor: conversationImportBusy ? 'default' : 'pointer', fontWeight: 700 }}>共有ログを読み込む</button>
              {conversationImportStatus ? <span style={{ color: '#166534', fontSize: '13px' }}>{conversationImportStatus}</span> : null}
            </div>

            {conversationImportError ? <div style={{ marginBottom: '14px', color: '#b91c1c', fontSize: '13px' }}>{conversationImportError}</div> : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <input type="text" value={conversationGenerationKnowledgeName} onChange={(e) => { setConversationGenerationKnowledgeName(e.target.value); setConversationGenerationPreview(null); resetConversationGenerationMessages(); }} placeholder="ナレッジ名ヒント（任意）" disabled={conversationGenerationBusy} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
              <select value={conversationGenerationTemplateId} onChange={(e) => { setConversationGenerationTemplateId(e.target.value); setConversationGenerationPreview(null); resetConversationGenerationMessages(); }} disabled={conversationGenerationBusy} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }}>
                {CONVERSATION_GENERATION_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
              <select value={conversationGenerationMode} onChange={(e) => { const nextMode = e.target.value as ConversationGenerationMode; setConversationGenerationMode(nextMode); if (nextMode !== 'attach-domain') { setConversationGenerationAttachDomainId(''); } if (nextMode !== 'create-domain') { setConversationGenerationDomainName(''); } setConversationGenerationPreview(null); resetConversationGenerationMessages(); }} disabled={conversationGenerationBusy} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }}>
                <option value="knowledge-only">ナレッジのみ追加</option>
                <option value="attach-domain">既存ドメインへアタッチ</option>
                <option value="create-domain">新規ドメインも作成</option>
              </select>
              <input type="text" value={conversationGenerationDomainName} onChange={(e) => { setConversationGenerationDomainName(e.target.value); setConversationGenerationPreview(null); resetConversationGenerationMessages(); }} placeholder="新規ドメイン名ヒント（任意）" disabled={conversationGenerationBusy || conversationGenerationMode !== 'create-domain'} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px', backgroundColor: conversationGenerationMode === 'create-domain' ? '#fff' : '#f8fafc' }} />
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>テンプレート: {selectedConversationGenerationTemplate.description}</div>

            <textarea value={conversationGenerationInput} onChange={(e) => { setConversationGenerationInput(e.target.value); setConversationGenerationPreview(null); resetConversationGenerationMessages(); }} rows={10} disabled={conversationGenerationBusy} placeholder={'例:\nユーザー: Ark-i のヘルプを docs ベースで答えるコンシェルジュを作りたい\nアシスタント: docs を横断した運用知識を作成し、専用ドメインにアタッチします'} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '14px', lineHeight: 1.7, marginBottom: '10px' }} />

            {conversationGenerationMode === 'attach-domain' ? (
              <div style={{ marginBottom: '10px' }}>
                <select value={conversationGenerationAttachDomainId} onChange={(e) => { setConversationGenerationAttachDomainId(e.target.value); setConversationGenerationPreview(null); resetConversationGenerationMessages(); }} disabled={conversationGenerationBusy} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }}>
                  <option value="">アタッチ先ドメインを選択</option>
                  {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name} ({domain.id})</option>)}
                </select>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
              <button type="button" onClick={handlePreviewConversationGeneration} disabled={conversationGenerationBusy || conversationGenerationInput.trim().length === 0} style={{ padding: '10px 14px', backgroundColor: conversationGenerationBusy ? '#94a3b8' : '#4f46e5', color: '#fff', border: 'none', borderRadius: '10px', cursor: conversationGenerationBusy ? 'default' : 'pointer', fontWeight: 700 }}>{conversationGenerationBusy ? '生成中...' : 'プレビューを生成'}</button>
              <button type="button" onClick={handleSaveConversationGeneration} disabled={conversationGenerationBusy || !conversationGenerationPreview} style={{ padding: '10px 14px', backgroundColor: conversationGenerationBusy || !conversationGenerationPreview ? '#cbd5e1' : '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', cursor: conversationGenerationBusy || !conversationGenerationPreview ? 'default' : 'pointer', fontWeight: 700 }}>保存して追加</button>
              {conversationGenerationSuccess ? <span style={{ color: '#166534', fontSize: '13px' }}>{conversationGenerationSuccess}</span> : null}
            </div>

            {conversationGenerationError ? <div style={{ marginBottom: '10px', color: '#b91c1c', fontSize: '13px' }}>{conversationGenerationError}</div> : null}

            {conversationGenerationPreview ? (
              <div style={{ marginTop: '12px', padding: '16px', borderRadius: '14px', backgroundColor: '#f8fafc', border: '1px solid #dbe4f0' }}>
                <div style={{ fontWeight: 700, marginBottom: '8px' }}>生成プレビューを編集</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>生成エンジン: {conversationGenerationPreview.provider} / {conversationGenerationPreview.model}</div>

                <div style={{ display: 'grid', gridTemplateColumns: conversationGenerationMode === 'knowledge-only' ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ fontWeight: 600 }}>ナレッジ案</div>
                    <input value={conversationGenerationPreview.knowledge.name} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, knowledge: { ...prev.knowledge, name: e.target.value } } : prev)} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
                    <input value={conversationGenerationPreview.knowledge.description} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, knowledge: { ...prev.knowledge, description: e.target.value } } : prev)} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
                    <textarea rows={4} value={conversationGenerationPreview.knowledge.systemPrompt} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, knowledge: { ...prev.knowledge, systemPrompt: e.target.value } } : prev)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '13px' }} />
                    <textarea rows={12} value={conversationGenerationPreview.knowledge.context} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, knowledge: { ...prev.knowledge, context: e.target.value } } : prev)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '13px' }} />
                  </div>

                  {conversationGenerationMode !== 'knowledge-only' ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <div style={{ fontWeight: 600 }}>ドメイン案</div>
                      <input value={conversationGenerationPreview.domain.name} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, domain: { ...prev.domain, name: e.target.value } } : prev)} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
                      <input value={conversationGenerationPreview.domain.characterName} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, domain: { ...prev.domain, characterName: e.target.value } } : prev)} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
                      <input value={conversationGenerationPreview.domain.description} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, domain: { ...prev.domain, description: e.target.value } } : prev)} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
                      <input value={conversationGenerationPreview.domain.themeColor} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, domain: { ...prev.domain, themeColor: e.target.value } } : prev)} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px' }} />
                      <textarea rows={6} value={conversationGenerationPreview.domain.baseSystemPrompt} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, domain: { ...prev.domain, baseSystemPrompt: e.target.value } } : prev)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '13px' }} />
                      <textarea rows={6} value={conversationGenerationPreview.domain.baseContext} onChange={(e) => setConversationGenerationPreview((prev) => prev ? { ...prev, domain: { ...prev.domain, baseContext: e.target.value } } : prev)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '13px' }} />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}