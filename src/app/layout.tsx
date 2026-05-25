import type { ReactNode } from 'react';
import AppHeader from './AppHeader';

export const metadata = {
  title: 'Ark-i 管理画面',
  description: 'Ark-i管理画面（知識注入・ドメイン管理）',
  manifest: '/icon/manifest.json',
  icons: {
    icon: [
      { url: '/icon/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon/favicon.ico' },
    ],
    apple: [{ url: '/icon/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/icon/icon-32x32.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: 'sans-serif',
          margin: 0,
          padding: 0,
          backgroundColor: '#f5f5f5',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AppHeader />
        <main style={{ flex: 1 }}>{children}</main>
        <footer
          style={{
            borderTop: '1px solid #ddd',
            padding: '10px 16px',
            fontSize: '12px',
            color: '#666',
            textAlign: 'center',
            backgroundColor: '#fff',
          }}
        >
          ©NFTDrive.inc　|　Version: {appVersion}
        </footer>
      </body>
    </html>
  );
}
