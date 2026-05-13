'use client';

import { useEffect } from 'react';
import { useState } from 'react';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('injection_token') : null;
    setIsLoggedIn(Boolean(token));
  }, []);

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background:
          'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.15), transparent 40%), radial-gradient(circle at 80% 0%, rgba(16,185,129,0.16), transparent 35%), #f5f7fb',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: '860px',
          backgroundColor: 'rgba(255,255,255,0.92)',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '36px 32px',
          boxShadow: '0 12px 36px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div style={{ display: 'inline-block', marginBottom: '12px', padding: '6px 10px', backgroundColor: '#eef2ff', color: '#4338ca', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
          Ark-i Admin Console
        </div>

        <h1 style={{ margin: 0, fontSize: '34px', lineHeight: 1.2, color: '#111827' }}>Ark-i 管理画面</h1>
        <p style={{ margin: '12px 0 0 0', color: '#4b5563', fontSize: '15px' }}>
          Ark-iシステムの知識注入・ドメイン設定を管理するコンソール
        </p>

        <div style={{ marginTop: '22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>運用モード</div>
            <div style={{ marginTop: '4px', fontWeight: 700, color: '#111827' }}>Fail-open設計</div>
          </div>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>管理対象</div>
            <div style={{ marginTop: '4px', fontWeight: 700, color: '#111827' }}>ドメイン / ナレッジ</div>
          </div>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>接続先</div>
            <div style={{ marginTop: '4px', fontWeight: 700, color: '#111827' }}>クライアント連携</div>
          </div>
        </div>

        <div style={{ marginTop: '26px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {isLoggedIn ? (
            <a
              href="/admin"
              style={{
                textDecoration: 'none',
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              管理画面へ
            </a>
          ) : (
            <a
              href="/login"
              style={{
                textDecoration: 'none',
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: '#111827',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              ログインへ
            </a>
          )}
        </div>

        <p style={{ marginTop: '14px', marginBottom: 0, color: '#6b7280', fontSize: '12px' }}>
          システム名: Ark-i（アークアイ） / この画面: Ark-i 管理画面
        </p>
      </section>
    </div>
  );
}
