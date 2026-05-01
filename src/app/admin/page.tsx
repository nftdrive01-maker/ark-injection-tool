'use client';

import { useEffect, useMemo, useState } from 'react';

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

type AssetType = 'vrm' | 'bgimage';

const DANGER_LINE_PERCENT = 90;
const WARNING_LINE_PERCENT = 75;

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
  const [activeTab, setActiveTab] = useState<'domain' | 'knowledge' | 'asset' | 'pronunciation'>('domain');
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [selectedPronunciation, setSelectedPronunciation] = useState<PronunciationRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [savingPronunciation, setSavingPronunciation] = useState(false);
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
  const [uploadingAsset, setUploadingAsset] = useState<AssetType | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<AssetType | null>(null);

  const applyPronunciationRules = (input: string, domainId?: string) => {
    const sortedRules = [...pronunciations]
      .filter((rule) => rule.enabled)
      .filter((rule) => !domainId || !rule.domainId || rule.domainId === domainId)
      .sort((a, b) => b.priority - a.priority);

    let output = input;
    for (const rule of sortedRules) {
      output = output.split(rule.from).join(rule.to);
    }

    return output;
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
    const [domainsRes, knowledgesRes, pronunciationsRes] = await Promise.all([
      fetch('/api/domains', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/knowledges', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/pronunciations', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (domainsRes.ok) {
      const domainData = await domainsRes.json();
      setDomains(domainData);
      if (domainData.length > 0) {
        setSelectedDomain(domainData[0]);
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

    if (domainsRes.status === 401 || knowledgesRes.status === 401 || pronunciationsRes.status === 401) {
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
                      <input
                        type="text"
                        value={selectedDomain.stylebertvits2ModelId || ''}
                        onChange={(e) =>
                          setSelectedDomain({ ...selectedDomain, stylebertvits2ModelId: e.target.value })
                        }
                        placeholder="例: 0"
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
        ) : (
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
                  </div>
                </>
              ) : (
                <p>発音辞書を選択してください</p>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
