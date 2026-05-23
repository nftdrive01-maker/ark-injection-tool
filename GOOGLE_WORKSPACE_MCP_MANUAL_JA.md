# Google Workspace MCP (Read-only) 連携マニュアル

最終更新: 2026-05-15
対象: Ark-i / injection-tool 環境

## 1. このマニュアルでできること

この手順で、以下を一連で設定できます。

- Google OAuth を read-only 最小権限で構成
- Google Workspace MCP サーバーを Ark-i から利用可能にする
- injection-tool 側の read-only allowlist を有効化
- セッション単位で Google Pack を attach して利用
- 監査ログを最小情報で確認

## 2. 前提条件

- injection-tool が起動している
- amica が起動している
- mcp-server が起動している
- 管理画面にログインできる

注意:
このリポジトリの compose には、Google Workspace MCP サーバー本体は同梱されていません。
Google Workspace MCP サーバーは別途起動し、SSE エンドポイントを用意してください。

## 3. 全体構成

- amica から injection-tool の intercept API を呼ぶ
- injection-tool がセッションの attach 状態を正本として管理する
- attach された場合のみ Google Workspace MCP サーバーへツール実行をルーティング
- 実行時は二重防御:
  - Google Workspace MCP サーバー側の tool allowlist
  - injection-tool 側の read-only tool allowlist

## 4. Google Cloud 側の設定

### 4-1. プロジェクト作成

1. Google Cloud Console で新規プロジェクトを作成
2. 課金設定が必要な場合は有効化

### 4-2. API 有効化

1. Gmail API を有効化
2. Google Calendar API を有効化
3. Google Drive API を有効化

### 4-3. OAuth 同意画面

1. OAuth consent screen を作成
2. テスト運用中は Test users を設定
3. 公開範囲は要件に応じて Internal または External

### 4-4. OAuth クライアント作成

Google Workspace MCP サーバー実装の要件に合わせてクライアント種別を作成します。

- Web アプリ型を使う実装:
  - Authorized redirect URI に MCP サーバー指定の callback URL を登録
- Installed app 型を使う実装:
  - ローカル認可フローの指示に従う

### 4-5. OAuth スコープ

read-only 最小権限で開始してください。推奨は以下です。

- https://www.googleapis.com/auth/gmail.readonly
- https://www.googleapis.com/auth/calendar.readonly
- https://www.googleapis.com/auth/drive.readonly

補足:
Drive をメタデータ取得だけに限定できる実装なら、drive.readonly の代わりに drive.metadata.readonly を検討してください。

## 5. Google Workspace MCP サーバー起動

運用する Google Workspace MCP サーバー実装の README に従って起動します。

必須条件:

- SSE エンドポイントが公開されていること
- read-only ツールのみ公開すること
- サーバー側 allowlist が有効であること

接続確認例:

- URL 例: http://google-workspace-mcp:8001/sse
- URL 例: http://localhost:8001/sse

実環境でどちらを使うかは、injection-tool コンテナから到達可能なホスト名で決めます。

## 6. injection-tool 側の設定

設定対象ファイル:
- .env.local

必須項目:

- INJECTION_GOOGLE_WORKSPACE_PACK_ID=google_workspace
- INJECTION_GOOGLE_WORKSPACE_MCP_SERVER_ID=google-workspace
- INJECTION_GOOGLE_READONLY_TOOLS=gmail_list_messages,gmail_get_message,gmail_search_messages,calendar_list_events,calendar_get_event,drive_list_files,drive_get_file
- INJECTION_MCP_AUDIT_LOG_PATH=./data/mcp-audit.jsonl

ポイント:

- PACK_ID は小文字で統一
- MCP_SERVER_ID は mcp-servers.json の id と一致させる
- allowlist は read-only ツール名のみを列挙

## 7. MCP サーバー登録

設定対象ファイル:
- data/mcp-servers.json

Google Workspace サーバー例:

- id: google-workspace
- transport: sse
- config.url: Google Workspace MCP の SSE URL
- enabled: true に変更
- aiRouting.allowedTools: read-only ツールのみ

重要:

- JSON 構文が壊れると管理画面で MCP サーバー一覧が空に見える
- 変更後は JSON 構文チェックを実施する

## 8. 管理画面での有効化

1. 管理画面の MCP 管理タブを開く
2. Google Workspace MCP (Read-only) を選択
3. enabled を ON
4. 必要なら timeout を調整
5. 保存

次にドメイン側で、Google連携を使いたいドメインへ該当MCPサーバーを紐付けます。

## 9. セッション単位 Pack Attach

Google Workspace は、attach されたセッションでのみ有効化します。

### 9-1. セッション取得

POST /api/public/sessions
body: {"domainId":"default"}

### 9-2. Google Pack attach

POST /api/public/sessions?action=attach
body: {"sessionId":"取得したsessionId","packId":"google_workspace"}

### 9-3. attach 状態確認

GET /api/public/sessions?action=attached&sessionId=...

期待値:
attachedPackIds に google_workspace が含まれる

## 10. 動作確認

### 10-1. チャット確認

amica から以下のような read-only 質問を送る。

- Gmail の未読メールを確認して
- 今日のカレンダー予定を確認して
- Drive の最近のファイル一覧を教えて

### 10-2. 期待する挙動

- metadata.mcpUsed が true
- metadata.mcpServerId が google-workspace
- metadata.mcpToolName が read-only ツール名
- write 系の指示は拒否または不実行

### 10-3. 拒否確認

送信系を指示して拒否されることを確認する。

- 例: Gmail でメールを送信して

期待値:
TOOL_NOT_ALLOWED などの拒否結果

## 11. 監査ログ確認

ログファイル:
- data/mcp-audit.jsonl

確認項目:

- requestId
- sessionId
- errorCode
- toolName
- targetKind
- resultCount
- contentHash

機密本文を保存しないこと:

- メール本文
- Drive本文
- カレンダー詳細本文

## 12. よくある失敗と対処

### 12-1. MCP一覧が消えた

- data/mcp-servers.json のJSON構文エラーを確認
- 構文エラー時はロード失敗で空配列扱いになる

### 12-2. Import で Failed to fetch MCP server metadata

- Google Workspace MCP サーバーが未起動
- SSE URL が誤り
- コンテナ内から到達できないホスト名を指定

### 12-3. attach したのに動かない

- sessionId が一致していない
- attach 後に別セッションでリクエストしている
- ドメインに google-workspace が紐付いていない
- enabled が false

### 12-4. write 系が通ってしまう

- Google Workspace MCP サーバー側 allowlist を確認
- INJECTION_GOOGLE_READONLY_TOOLS を確認
- mcp-servers.json の aiRouting.allowedTools を確認

## 13. 最小チェックリスト

- Google API 3種有効化済み
- OAuth スコープが read-only のみ
- Google Workspace MCP サーバーがSSE公開中
- google-workspace サーバー定義が enabled=true
- ドメイン紐付け済み
- セッション attach 済み
- write 系が拒否される
- 監査ログに機密本文がない
