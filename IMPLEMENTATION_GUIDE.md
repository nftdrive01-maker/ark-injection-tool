# 実装完成ガイド

動的知識注入型 カスタムAI窓口基盤（Flexible AI-Agent Foundation）の実装が完了しました。

## 実装内容サマリ

### ✅ 完成した機能

#### 1. **Amica側 インターセプト実装**
- `src/features/chat/chat.ts`: UI通常会話路線での注入実装
- `src/utils/askLlm.ts`: externalAPI 路線での注入実装
- `src/lib/injectionClient.ts`: 注入API呼び出しクライアント（fail-open対応）
- `src/lib/injectionCache.ts`: ハイブリッドキャッシュロジック（TTL付き）
- 環境変数: NEXT_PUBLIC_INJECTION_TOOL_* への対応

#### 2. **injection-tool 独立管理ツール**
- **ログイン画面** (`/login`): 環境変数ベースのID/パスワード認証
- **管理画面** (`/admin`): ドメイン別の知識ベース編集UI
- **API エンドポイント群**:
  - `/api/auth/login`: 認証（トークン発行）
  - `/api/intercept`: **核心** - Amica送信前インターセプト、注入データ返却
  - `/api/domains`: ドメイン一覧・管理
  - `/api/domains/{id}`: 個別ドメイン更新
  - `/api/health`: ヘルスチェック（死活監視用）
- **バックエンド ロジック**:
  - `src/lib/auth.ts`: 認証・トークン管理
  - `src/lib/domains.ts`: JSON ファイルベースの永続管理

#### 3. **型定義・I/F仕様**
- `types/injection.ts` (Amica側): 共有型定義
- `types/injection.ts` (injection-tool側): 同型
- fail-open条件を明記（URL未設定、HTTP 5xx、タイムアウト等での素通し）

#### 4. **ドキュメント**
- injection-tool README.md
- Amica README.md 更新（Dynamic Knowledge Injection セクション）
- .env.example / .env.local 設定見本

---

## 運用開始ステップ

### Phase 1: ローカル検証（同一マシン）

#### 1.1 injection-tool の起動

```bash
cd d:\injection-tool
npm install
npm run dev
```

**確認**: http://localhost:4001/api/health → `{"status":"ok"}`

#### 1.2 ログイン確認

- URL: http://localhost:4001/login
- ID: `admin`
- PW: `.env.local` の `INJECTION_ADMIN_PASSWORD` 値
- ✅ ログイン成功 → /admin リダイレクト

#### 1.3 ドメイン確認

- `/admin` 側バー で「専門相談」「施設案内」「緊急告知」が表示
- 各ドメインのシステムプロンプト・コンテキストが編集可能

#### 1.4 Amica 起動

```bash
cd d:\amica
npm install
npm run dev
```

`.env.local` に既に以下が設定されていることを確認:
```env
NEXT_PUBLIC_INJECTION_TOOL_URL=http://localhost:4001
NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true
```

#### 1.5 E2E 検証

1. **注入なし状態で確認**:
   - `NEXT_PUBLIC_INJECTION_TOOL_ENABLED=false` に変更して Amica 再起動
   - ユーザー入力が「素の」システムプロンプトで処理される

2. **注入あり状態で確認**:
   - `NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true` に戻す
   - injection-tool で「専門相談」ドメイン内容を編集（例: "【医学知識】..." を追加）
   - Amica でユーザー入力を送信
   - ブラウザコンソール確認: `fetchInjectedContext` 呼び出しログ
   - LLM回答が編集内容を反映していることを確認

3. **fail-open 検証**:
   - injection-tool を停止（Ctrl+C）
   - Amica でユーザー入力を送信
   - ✅ エラーなく通常稼働（コンソールに "trying cache fallback" ログ）

4. **キャッシュ動作確認**:
   - ブラウザコンソール: `getInjectionCacheStats()`
   - ✅ キャッシュエントリが保存されている

### Phase 2: ドメイン運用

#### 2.1 複数ドメインの切替

1. Amica `.env.local` に追加:
   ```env
   NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN=facility_guide
   ```

2. Amica 再起動後、「施設案内」ドメイン内容が自動適用

#### 2.2 定期更新 - 非エンジニア向け

- Web フォーム（/admin）でプロンプト変更すれば OK
- Amica ガウえ再起動不要（次回送信時に自動反映）

### Phase 3: 本番配置

#### 3.1 別マシン配置（オプション）

- injection-tool を別ホスト（例: localhost:4001 → 192.168.1.100:4001）に配置
- Amica `.env.local` の URL を更新
- CORS 許可オリジン設定を injection-tool で変更

#### 3.2 認証強化（将来）

- 現在: 単純な固定ID/PW
- 今後: JWT, OAuth, mTLS 等を追加検討

#### 3.3 永続化・バックアップ

- domains.json を定期バックアップ
- Git で version 管理可能

---

## トラブルシューティング

### 症状: Amica が注入を利用していない

**確認事項:**
1. `.env.local` に `NEXT_PUBLIC_INJECTION_TOOL_URL` が設定されているか
2. injection-tool が起動しているか (`http://localhost:4001/api/health`)
3. ブラウザコンソールで Fetch エラーが出ていないか
4. `NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true` が設定されているか

**対処:**
```bash
# キャッシュをクリア（ブラウザコンソール）
clearInjectionCache()

# 設定値を再度読み込む
```

### 症状: injection-tool がログイン不可

**確認:**
- `.env.local` で `INJECTION_ADMIN_USERNAME` と `INJECTION_ADMIN_PASSWORD` が設定されているか
- ID/PW が正確に一致しているか

**対処:**
```bash
# injection-tool 再起動
npm run dev
```

### 症状: ドメイン一覧が空

**確認:**
- `data/domains.json` が存在するか
- ファイルのパーミッションが読み取り可能か

**対処:**
```bash
# デフォルトドメインを再初期化（Node REPL）
node
> const {initializeDefaultDomains} = require('./dist/lib/domains');
> initializeDefaultDomains();
```

---

## アーキテクチャ図（テキスト表記）

```
┌─────────────────┐
│  Amica Browser  │
│  (Port 3000)    │
└────────┬────────┘
         │ (1) UserText 送信前
         │     fetchInjectedContext()
         ↓
    ┌────────────────────────────┐
    │ (2) HTTP POST /api/intercept│
    └────────┬───────────────────┘
             ↓
┌────────────────────────────────────────────┐
│        Injection Tool                      │
│        (Port 4001)                         │
│                                            │
│  ┌─ /api/intercept                        │
│  │  ├─ domainId lookup                    │
│  │  └─ {injectedSystemPrompt, context}   │
│  │                                        │
│  ├─ /admin（管理画面）                   │
│  │  └─ Domain CRUD                       │
│  │                                        │
│  └─ data/domains.json                    │
│     (永続層: プロンプト・コンテキスト)    │
└────────┬───────────────────────────────────┘
         │ (3) Response かキャッシュ
         ↓
┌─────────────────────────────────────┐
│ Amica - Message 合成                │
│                                     │
│  system = config.system_prompt      │
│         + injected.systemPrompt     │
│                                     │
│  user = userInput                   │
│       + injected.userContext        │
└─────────────────────────────────────┘
         │ (4) LLM へ送信
         ↓
    ┌─────────────┐
    │ LLM Backend │
    │ (Ollama等)  │
    └─────────────┘
```

---

## ファイル構成（最終版）

```
d:\amica\
├── src\
│   ├── features\chat\
│   │   └── chat.ts ← 注入ロジック挿入
│   ├── utils\
│   │   ├── config.ts ← 環境変数追加
│   │   └── askLlm.ts ← 注入ロジック挿入
│   ├── lib\
│   │   ├── injectionClient.ts ← 新規
│   │   └── injectionCache.ts ← 新規
│   └── types\
│       └── injection.ts ← 新規
├── .env.local (更新)
└── README.md (更新)

d:\injection-tool\
├── src\
│   ├── app\
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login\
│   │   │   └── page.tsx
│   │   ├── admin\
│   │   │   └── page.tsx
│   │   └── api\
│   │       ├── auth\
│   │       │   └── login\
│   │       │       └── route.ts
│   │       ├── domains\
│   │       │   ├── route.ts
│   │       │   └── [id]\
│   │       │       └── route.ts
│   │       ├── intercept\
│   │       │   └── route.ts
│   │       └── health\
│   │           └── route.ts
│   ├── lib\
│   │   ├── auth.ts
│   │   └── domains.ts
│   └── types\
│       └── injection.ts
├── types\
│   └── injection.ts
├── data\ ← 実行時作成
│   └── domains.json (デフォルト初期化)
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.local
├── .env.example
├── .gitignore
└── README.md
```

---

## 次のステップ（将来拡張）

- [ ] CMS / Google Sheets 連携（管理ソース差替え）
- [ ] 複数ユーザー・監査ログ
- [ ] WebUI上でのドメイン新規作成
- [ ] TTL別・キャッシュ戦略の細分化
- [ ] 背景画像・ビジュアルアセット管理
- [ ] API キー認証 / mTLS
- [ ] メディアストレージ（画像・動画）対応

---

## 重要な注語

- **fail-open**: injection-tool 停止しても Amica は確実に稼働
- **ドメイン**: 知識ソースの識別子（consultation, facility_guide等）
- **TTL**: Time To Live - キャッシュ有効期限（秒）
- **バイパス**: 注入適用をスキップして素の入力をLLMに送信

---

**実装完了日**: 2026年4月26日  
**バージョン**: 1.0.0 MVP  
**最終確認**: すべてのファイル生成・コード修正・ドキュメント完了
