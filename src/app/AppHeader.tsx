'use client';

import { usePathname } from 'next/navigation';

export default function AppHeader() {
  const pathname = usePathname();
  const showLogoutButton = pathname !== '/' && pathname !== '/login';
  const showHelpLink = pathname !== '/login';
  const showAdminLink = pathname === '/help';
  const showConversationGeneratorLink = pathname.startsWith('/admin');
  const isConversationGeneratorPage = pathname === '/admin/conversation-generator';

  return (
    <header
      style={{
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderBottom: '1px solid #ddd',
        backgroundColor: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <a
        href="/"
        style={{
          textDecoration: 'none',
          color: '#111827',
          fontWeight: 800,
          fontSize: '18px',
          letterSpacing: '0.2px',
        }}
      >
        Ark-i
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {showAdminLink ? (
          <a
            href="/admin"
            style={{
              textDecoration: 'none',
              padding: '8px 14px',
              backgroundColor: '#f8fafc',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            管理画面へ
          </a>
        ) : null}

        {showConversationGeneratorLink ? (
          <a
            href="/admin/conversation-generator"
            style={{
              textDecoration: 'none',
              padding: '8px 14px',
              backgroundColor: isConversationGeneratorPage ? '#dbeafe' : '#f8fafc',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            会話生成
          </a>
        ) : null}

        {showHelpLink ? (
          <a
            href="/help"
            style={{
              textDecoration: 'none',
              padding: '8px 14px',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ヘルプ
          </a>
        ) : null}

        {showLogoutButton ? (
          <button
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
              } finally {
                localStorage.removeItem('injection_token');
                window.location.href = '/login';
              }
            }}
            style={{
              padding: '8px 14px',
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ログアウト
          </button>
        ) : null}
      </div>
    </header>
  );
}
