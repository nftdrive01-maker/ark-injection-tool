'use client';

export default function AppHeader() {
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

      <button
        onClick={() => {
          localStorage.removeItem('injection_token');
          window.location.href = '/login';
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
    </header>
  );
}
