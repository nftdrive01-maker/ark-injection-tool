'use client';

import { useEffect, useState } from 'react';

interface Domain {
  id: string;
  name: string;
  description: string;
  baseSystemPrompt: string;
  baseContext: string;
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

export default function AdminPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [knowledges, setKnowledges] = useState<Knowledge[]>([]);
  const [pronunciations, setPronunciations] = useState<PronunciationRule[]>([]);
  const [activeTab, setActiveTab] = useState<'domain' | 'knowledge' | 'pronunciation'>('domain');
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [selectedPronunciation, setSelectedPronunciation] = useState<PronunciationRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [savingPronunciation, setSavingPronunciation] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pronunciationTestInput, setPronunciationTestInput] = useState('');
  const [pronunciationTestDomainId, setPronunciationTestDomainId] = useState('');
  const [pronunciationTestOutput, setPronunciationTestOutput] = useState('');

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
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
              <h2>{selectedDomain.name}</h2>
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

                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>合成結果プレビュー（保存後反映）</div>
                  <div style={{ fontSize: '12px', color: '#444', whiteSpace: 'pre-wrap' }}>{selectedDomain.systemPrompt || '(空)'}</div>
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
              </form>
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
