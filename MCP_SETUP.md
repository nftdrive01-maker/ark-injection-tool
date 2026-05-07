# MCP サーバー設定マニュアル

Model Context Protocol (MCP) を使って Amica に外部ツール実行機能を追加する手順を説明します。

---

## 目次

1. [概要](#1-概要)
2. [MCP サーバーの準備](#2-mcp-サーバーの準備)
3. [管理画面からのインポート（自動設定）](#3-管理画面からのインポート自動設定)
4. [手動登録](#4-手動登録)
5. [ルーティングモードの設定](#5-ルーティングモードの設定)
6. [ドメインへの紐付け](#6-ドメインへの紐付け)
7. [動作確認](#7-動作確認)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. 概要

injection-tool の MCP 機能は、Amica がユーザーの発話に対してリアルタイムで外部ツールを呼び出す仕組みです。

```
Amica ──▶ injection-tool ──▶ MCP サーバー ──▶ ツール実行
              (ルーター)         (Python等)        (fetch, grep, etc.)
```

### ルーティングモード一覧

| モード | 動作 |
|--------|------|
| `rule` | キーワードに一致したツールを直接呼び出す |
| `ai` | LLM（Ollama 等）がツールを判断して呼び出す |
| `hybrid` | rule が優先され、マッチしなければ ai にフォールバック |

---

## 2. MCP サーバーの準備

### 2-1. 必要要件

- MCP サーバーが **SSE トランスポート** で起動していること
- `get_server_metadata` ツールを実装していること（自動インポート用）

### 2-2. fetch-server の起動例（同梱サンプル）

```bat
cd d:\mcp-server
.\Start-Server.bat
```

起動後、以下の URL でアクセスできることを確認してください：

```
http://localhost:8000/sse
```

### 2-3. `get_server_metadata` ツールの実装（自作サーバーの場合）

自作 MCP サーバーに以下のツールを追加すると、管理画面から自動インポートが使えます。

```python
import json
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
def get_server_metadata() -> str:
    """injection-tool 自動インポート用メタデータ"""
    metadata = {
        "name": "my-server",
        "description": "サーバーの説明",
        "tools": [
            {"name": "my_tool", "description": "ツールの説明"}
        ],
        "defaultConfig": {
            "mode": "ai",
            "timeout": 10000,
            "aiRouting": {
                "provider": "ollama",
                "model": "qwen2.5:7b",
                "temperature": 0.1,
                "maxTokens": 240,
                "confidenceThreshold": 0.55,
                "allowedTools": ["my_tool"],
                "fallbackTool": "my_tool",
                "systemPrompt": "あなたはMCPツールルーターです。適切なツールを選んでください。"
            }
        }
    }
    return json.dumps(metadata, ensure_ascii=False, indent=2)
```

---

## 3. 管理画面からのインポート（自動設定）

MCP サーバーに `get_server_metadata` が実装されている場合、URL を入力するだけで全設定を自動取得できます。

### 手順

1. ブラウザで管理画面を開く  
   ```
   http://localhost:4001/admin
   ```

2. **MCP管理** タブをクリック

3. 左パネルの「**MCPサーバーをインポート**」セクションで MCP サーバーの SSE URL を入力  
   ```
   http://localhost:8000/sse
   ```

4. **インポート** ボタンをクリック

5. 成功すると左の一覧にサーバーが追加され、設定が自動入力されます

### 設定の更新

MCP サーバー側の設定を変更した場合、管理画面で該当サーバーを選択し、「**🔄 設定を更新**」ボタンをクリックします。

- `allowedTools`、`systemPrompt` などが最新の `get_server_metadata` の内容に上書きされます
- Rule Routing は自動的に `enabled: false` /`rules: []` にリセットされます

---

## 4. 手動登録

`get_server_metadata` が実装されていないサーバーは手動で登録します。

1. 左パネルの **＋新規追加** をクリックしてサーバー名を入力

2. 右側のフォームで各項目を入力：

   | 項目 | 必須 | 説明 |
   |------|------|------|
   | サーバー名 | ✅ | 管理用の識別名 |
   |説明 | — | メモ用 |
   | トランスポート | ✅ | `sse`（通常）/ `http` / `stdio` |
   | SSE URL | ✅（sse時） | `http://localhost:8000/sse` |
   | タイムアウト | ✅ | ms単位（推奨: `10000`） |
   | ルーティングモード | ✅ | `rule` / `ai` / `hybrid` |

3. **保存** ボタンをクリック

---

## 5. ルーティングモードの設定

### 5-1. AI ルーティング（推奨）

LLM が自動でツールを選択します。

| 項目 | 説明 |
|------|------|
| Provider | `ollama`（ローカル）または `openai` |
| Model | ルーター用モデル（例: `qwen2.5:7b`）|
| System Prompt | ツール選択を指示するプロンプト |
| Temperature | 低いほど安定（推奨: `0.1`） |
| Max Tokens | ルーターの返答上限（推奨: `240`） |
| Confidence Threshold | この値未満は no_tool 扱い（推奨: `0.55`） |
| Allowed Tools | 呼び出しを許可するツール名のリスト |
| Fallback Tool | 判断できない場合に使うツール |

**System Prompt のテンプレート（コピー用）:**

```
あなたはMCPツール選択専用のルーターです。
ユーザー入力を読み、利用すべきツールを1つだけ選択してください。

制約:
- allowedTools に含まれるツールだけ選択する
- 不明な場合は fallbackTool を選択する
- 実行はしない（選択のみ）
- 出力はJSONのみ（説明文禁止）

出力形式:
{"tool":"tool_name","confidence":0.0,"args":{},"reason":"短い理由","risk":"low"}
```

### 5-2. Rule ルーティング

キーワードに一致した場合にツールを直接呼び出します。AI なしで高速・確実に動作させたい場合に使います。

```json
[
  {
    "id": "fetch_rule",
    "enabled": true,
    "priority": 100,
    "keywords": ["URL", "ウェブ", "サイト", "検索"],
    "toolName": "fetch_url",
    "argsTemplate": { "url": "{{url}}" }
  }
]
```

---

## 6. ドメインへの紐付け

MCPサーバーを登録しただけでは Amica には適用されません。**ドメイン**に紐付ける必要があります。

1. **ドメイン管理** タブを開く
2. 対象のドメインを選択
3. 「**MCPサーバー**」欄で登録済みサーバーにチェックを入れる
4. **保存**

---

## 7. 動作確認

### 7-1. 接続テスト

MCP管理タブでサーバーを選択し、**接続テスト** ボタンをクリックします。  
成功すると `✅ 接続成功`、失敗すると赤でエラーが表示されます。

### 7-2. Amica から動作確認

Amica のチャット画面でツールに関連する質問をしてみます。

- fetch-server の場合: 「`https://example.com` のページを取得して」
- ファイル検索の場合: 「`C:\Users\` 以下の .txt ファイルを探して」

ブラウザの DevTools → Network タブで `/api/injection/intercept/` レスポンスを確認し、`metadata.mcpUsed: true` になっていれば成功です。

---

## 8. トラブルシューティング

### インポートに失敗する

| 原因 | 対処 |
|------|------|
| MCP サーバーが起動していない | `Start-Server.bat` を実行して確認 |
| URL が間違っている | `http://localhost:8000/sse` を直接ブラウザで開いて確認 |
| `get_server_metadata` が未実装 | 手動登録を使う |
| ポートが競合している | `Get-NetTCPConnection -LocalPort 8000` で確認 |

### ツールが呼ばれない

| 原因 | 対処 |
|------|------|
| ドメインに MCPサーバーが紐付いていない | ドメイン管理で紐付けを確認 |
| `allowedTools` にツール名がない | AI ルーティングの Allowed Tools を確認 |
| タイムアウト | タイムアウト値を増やす（推奨: 10000ms 以上）|
| LLM のルーター判断が `no_tool` | System Prompt や Confidence Threshold を調整 |
| Amica のタイムアウトが短い | `.env.local` の `NEXT_PUBLIC_INJECTION_TOOL_TIMEOUT_MS` を `8000` 以上に設定 |

### タイムアウトの設定（Amica 側）

`d:\amica\.env.local` に以下を追記：

```env
NEXT_PUBLIC_INJECTION_TOOL_TIMEOUT_MS=8000
```

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `data/mcp-servers.json` | MCP サーバー設定の保存先 |
| `src/lib/mcp-servers.ts` | MCP 管理ロジック |
| `src/app/api/mcp-servers/` | MCP CRUD API |
| `src/app/api/mcp-servers/import/` | インポート API |
| `src/app/api/intercept/` | Amica からの MCP 呼び出し受付 |
