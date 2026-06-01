# Ark-i（アークアイ）

クライアント連携向けの**動的知識注入ツール**。外部ソースからリアルタイムに最新情報を読み込み、AIの回答精度を高める補助ツール。

公開リポジトリ: https://github.com/nftdrive01-maker/ark-injection-tool

このリポジトリの既定運用ブランチは `main` です。

## 概要

- **独立停止可能**: クライアント本体の安定性に影響なし
- **マルチドメイン対応**: 複数の知識ソースを ドメイン別に管理・切替
- **ハイブリッドキャッシュ**: クライアント側でオフライン時フォールバック対応
- **fail-open設計**: API障害時も クライアント は通常稼働
- **公開管理対応**: 公開設定 API と管理 UI で外部公開条件を制御可能
- **ヘルプ閲覧**: `/help` で Ark-i 関連ドキュメントを参照可能
- **会話から生成**: `/admin/conversation-generator` から会話履歴ベースで Knowledge / ドメイン下書きを生成可能

## クイックスタート

### 1. インストール

```bash
cd d:\injection-tool
npm install
```

### 2. 環境設定

`.env.local` を編集：

```env
INJECTION_ADMIN_USERNAME=admin
INJECTION_ADMIN_PASSWORD=your_secure_password
```

### 3. 起動

```bash
npm run dev
# http://localhost:4001 で起動
```

GitHub から clone する場合:

```bash
git clone https://github.com/nftdrive01-maker/ark-injection-tool.git
cd ark-injection-tool
npm install
```

### 4. ログイン

ブラウザで `http://localhost:4001/login` にアクセス。  
初期アカウント: `admin` / `your_secure_password`

### 5. ドメイン管理

`/admin` から複数ドメイン（専門相談、施設案内、緊急告知など）を管理。  
各ドメイン内でシステムプロンプトとコンテキストを更新可能。

### 6. 発話辞書

既定の発話辞書は `data/pronunciations.json` にあり、公開リポジトリの追跡対象です。発話辞書の更新手順、ローカル専用差し替え、公開時の注意は [PRONUNCIATION_DICTIONARY_MANUAL_JA.md](./PRONUNCIATION_DICTIONARY_MANUAL_JA.md) を参照してください。

追加機能:

- `/admin/conversation-generator`: 会話履歴から Knowledge / ドメイン案を preview / save
- `/help`: Ark-i ドキュメントの検索・閲覧
- 公開設定: `/api/public-management` と `/api/public/settings` で公開状態を取得・更新

## API エンドポイント

### POST `/api/intercept`

クライアント がユーザー送信前にこのエンドポイントを呼び出し、動的コンテキストを取得。

**リクエスト:**
```json
{
  "userText": "ユーザー入力",
  "domainId": "consultation",
  "sessionId": "optional",
  "messageHistory": []
}
```

**レスポンス:**
```json
{
  "injectedSystemPrompt": "追加のシステムプロンプト",
  "injectedUserContext": "参考情報",
  "metadata": {
    "domainId": "consultation",
    "ttl": 3600,
    "version": "1.0.0"
  }
}
```

### GET `/api/health`

生死確認用エンドポイント。  
クライアント は軽量な疎通チェックに使用（任意）。

**レスポンス:**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

## クライアントとの連携

### 環境変数設定

クライアント の `.env.local` に以下を追加：

```env
# クライアント側
NEXT_PUBLIC_INJECTION_TOOL_URL=http://localhost:4001
NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true
NEXT_PUBLIC_INJECTION_TOOL_TIMEOUT_MS=2000
NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN=consultation

# サーバー側（オプション）
INJECTION_TOOL_INTERNAL_URL=http://localhost:4001
```

### 動作フロー

1. ユーザーが クライアント にテキストを送信
2. クライアント が **LLM送信直前** に injection-tool へ HTTP POST
3. injection-tool がドメイン別の知識ベースを返す（fail-open）
4. クライアント が システムプロンプトとユーザー入力に知識を合成
5. LLM へ拡張されたメッセージを送信

### Fail-Open（障害分離）

以下の場合、クライアント は injection-tool をスキップして通常稼働：

- URL 未設定
- HTTP 5xx エラー
- タイムアウト（デフォルト 2秒）
- JSON 解析エラー
- injection-tool 停止中

## ドメイン管理

### 既定ドメイン

1. **consultation**: 専門的相談対応
2. **facility_guide**: 施設・場所案内
3. **urgent_notice**: 緊急告知（TTL 短） 

### カスタムドメイン追加

`/admin` → 新規ドメイン作成フォーム経由で追加可能（v2予定）

### システムプロンプト記載ガイド

```
【ドメイン名】
- 説明: どの場面で参照されるか
- 例: 「専門相談」なら、特定分野の専門知識を記述
```

## セキュリティ

### 認証

- 固定ID/パスワード認証（開発環境最小化用）
- 管理画面(`/admin`)へはログイン必須
- API(`/api/intercept`)は認証なし（CORS制限）

### CORS

同一マシン localhost のみ許可。別ホスト接続時は設定変更が必要。

### 実行時データ

以下の実行時データは公開リポジトリに含めない前提です。

- `data/admin-login-history.jsonl`
- `data/mcp-audit.jsonl`
- `data/domain-chat-history.sqlite`
- `data/domain-shared-logs.sqlite`

これらは `.gitignore` で除外し、ローカル運用時のみ保持します。

## トラブルシューティング

### クライアント が知識注入を利用していない

- `.env.local` で `NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true` を確認
- injection-tool が起動している確認（`http://localhost:4001/api/health`）
- ブラウザコンソール で fetch エラーを確認

### ドメインが反映されない

- キャッシュを確認: `getInjectionCacheStats()` をコンソールで実行
- キャッシュをクリア: `clearInjectionCache()` をコンソールで実行

### injection-tool の起動失敗

- ポート 4001 が使用中でないか確認
- `npm install` が完了したか確認
- `.env.local` の INJECTION_ADMIN_PASSWORD が設定されているか確認

## 今後の拡張（v2以降）

- [ ] Google Sheets / CMS 連携
- [ ] 複数ユーザー管理・監査ログ
- [ ] ドメイン別TTL、アセット管理UI
- [ ] 自動キャッシュプリフェッチ
- [ ] mTLS / API キー認証

## ライセンス

クライアント本体に準じる

## サポート

問題報告: [issue tracker]

---

**更新日**: 2026年4月  
**バージョン**: 1.0.0 MVP
