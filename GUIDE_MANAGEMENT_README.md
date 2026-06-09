# ガイド管理 README

Ark-i の presentation モードで使う「ガイドDeck JSON」を作成・編集・保存するための仕様メモです。

## 概要

ガイドは、Amica に Web サイト、画像、QAページを表示させながら、各ページの説明文を TTS で読み上げるためのデータです。

injection-tool の管理画面に追加した「ガイド管理」タブから、Deck JSON をフォーム編集できます。

## 管理画面

URL:

```text
http://localhost:4001/admin
```

操作:

1. 管理画面を開く
2. 上部タブの「ガイド管理」を選択
3. 左側のガイド一覧から対象ガイドを選択
4. 基本情報、ページ、読み上げノートを編集
5. 「ガイド保存」を押す

## 保存場所

デフォルトの保存先:

```text
data/guides.json
```

環境変数で変更可能:

```text
INJECTION_GUIDES_CONFIG=./data/guides.json
```

初回アクセス時にファイルが存在しない場合、サンプルガイド `ark_i_web_demo` が自動生成されます。

## API

管理APIは既存の管理画面と同じ Bearer 認証を使います。

### 一覧取得

```http
GET /api/guides
```

### 新規作成

```http
POST /api/guides
Content-Type: application/json
```

### 単体取得

```http
GET /api/guides/{deck_id}
```

### 更新

```http
PUT /api/guides/{deck_id}
Content-Type: application/json
```

### 削除

```http
DELETE /api/guides/{deck_id}
```

注意:

- ガイドは最低1件残す仕様です。
- 最後の1件は削除できません。

## JSON仕様

基本形:

```json
{
  "deck_id": "ark_i_web_demo",
  "version": "0.1.0",
  "title": "Ark-i Webデモ",
  "description": "Webページを表示しながらArk-iが説明する3ページ構成のデモ",
  "tags": ["Ark-i", "Webデモ", "展示会", "説明会"],
  "slides": [
    {
      "slide_no": 1,
      "type": "web",
      "url": "https://ark-i.nftdrive.net",
      "display_seconds": 10,
      "notes": "こちらがArk-iのランディングページです。"
    }
  ],
  "qa_context": {
    "enabled": true,
    "source": "slides_and_notes"
  }
}
```

## Deckフィールド

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `deck_id` | string | 必須 | ガイドDeckのID。英数字、`_`、`-` 推奨 |
| `version` | string | 必須 | Deck仕様またはデータのバージョン |
| `title` | string | 必須 | 管理画面やプレゼン表示用タイトル |
| `description` | string | 任意 | Deckの説明 |
| `tags` | string[] | 任意 | 検索・分類用タグ |
| `slides` | Slide[] | 必須 | 表示するページ配列 |
| `qa_context` | object | 任意 | QA時にスライド内容を文脈化するための設定 |

## Slideフィールド

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `slide_no` | number | 必須 | 表示順。保存時に1始まりで再採番 |
| `type` | `"web"` / `"image"` / `"qa"` | 必須 | ページ種別 |
| `title` | string | 任意 | QAページ見出しなど |
| `url` | string | web/imageで使用 | WebページURLまたは画像URL |
| `display_seconds` | number | 任意 | 自動切替までの表示秒数 |
| `notes` | string | 必須 | AmicaがTTSで読み上げる説明文 |

## ページ種別

### web

Webサイトを iframe で表示します。

```json
{
  "slide_no": 1,
  "type": "web",
  "url": "https://ark-i.nftdrive.net",
  "display_seconds": 10,
  "notes": "こちらがArk-iのランディングページです。"
}
```

注意:

- 表示先サイトの CSP や `X-Frame-Options` により iframe 表示できない場合があります。
- Amica側のモーダルには「外部で開く」導線を用意しています。

### image

画像を全画面スライドとして表示します。

```json
{
  "slide_no": 2,
  "type": "image",
  "url": "https://ark-i.nftdrive.net/img/screenshot1.png",
  "display_seconds": 10,
  "notes": "この図はArk-iの基本構成です。"
}
```

### qa

質疑応答や区切りページを表示します。

```json
{
  "slide_no": 3,
  "type": "qa",
  "title": "質疑応答",
  "display_seconds": 10,
  "notes": "以上で説明は終了です。ここからは、Ark-iについてご質問ください。"
}
```

## 表示時間

`display_seconds` は各ページの表示秒数です。

未指定または不正値の場合:

```text
10秒
```

Amica側の動作:

1. スライドが表示される
2. すぐに `notes` をTTSへ送る
3. `display_seconds` 秒待つ
4. 次のスライドへ切り替える
5. 切替直後に次スライドの `notes` をTTSへ送る

## QA Context

```json
{
  "qa_context": {
    "enabled": true,
    "source": "slides_and_notes"
  }
}
```

現状では、Deck JSON上にQA用の意図を保存するメタ情報です。

将来的には、presentation終了後の質問応答で `slides` と `notes` をコンテキストとして使う想定です。

## 管理画面の機能

現在のガイド管理画面でできること:

- ガイド一覧表示
- ガイド新規作成
- ガイド削除
- Deck基本情報編集
- タグ編集
- QA context編集
- ページ追加
- ページ削除
- ページ種別変更
- Web/画像URL編集
- 表示秒数編集
- 読み上げノート編集
- JSON貼り付け取り込み
- JSONプレビュー
- JSONダウンロード

## Domainへのアタッチ

Guide MCP は、DomainにアタッチされたGuideだけを参照します。

Domain側のデータ構造:

```json
{
  "id": "db-mcp",
  "name": "DB-mcp",
  "mcpServerIds": ["guide"],
  "attachedGuideIds": ["ark_i_web_demo"]
}
```

設定手順:

1. 管理画面の「ドメイン管理」を開く
2. 対象Domainを選ぶ
3. サブタブ「連携・構成」を開く
4. 「アタッチするガイド」でGuideを選ぶ
5. 「組み合わせるMCPサーバー」で `Guide MCP` をONにする
6. Domainを保存する

参照制限:

- `domain_id` が指定された場合、そのDomainの `attachedGuideIds` に含まれるGuideだけ検索できます。
- 他Domainにだけ紐づくGuideは検索・取得・開始できません。
- `attachedGuideIds` が空の場合、Guide MCPは空結果または開始失敗を返します。

## Guide MCP

Guide MCP は外部プロセスではなく、injection-tool内部の疑似MCPとして実装しています。

MCPサーバー一覧にはプリセットとして表示されます。

```text
Guide MCP
id: guide
transport: internal
```

ツール名は安全のためドットではなくアンダースコアを使います。

| ツール | 説明 |
| --- | --- |
| `guide_list` | DomainにアタッチされたGuide一覧を返す |
| `guide_search` | DomainにアタッチされたGuideをタイトル、説明、タグ、notesから検索する |
| `guide_get` | Domainにアタッチされた指定GuideのDeck JSONを返す |
| `guide_start` | DomainにアタッチされたGuideの再生開始イベントを返す |

### guide_list

入力:

```json
{
  "domain_id": "db-mcp"
}
```

出力:

```json
{
  "type": "guide.list",
  "domain_id": "db-mcp",
  "guides": [
    {
      "guide_id": "ark_i_web_demo",
      "title": "Ark-i Webデモ",
      "slide_count": 3
    }
  ]
}
```

### guide_search

入力:

```json
{
  "domain_id": "db-mcp",
  "query": "Ark-i Webデモ"
}
```

検索対象:

- `deck_id`
- `title`
- `description`
- `tags`
- `slides.title`
- `slides.url`
- `slides.notes`

### guide_get

入力:

```json
{
  "domain_id": "db-mcp",
  "guide_id": "ark_i_web_demo"
}
```

DomainにアタッチされていないGuideは返しません。

### guide_start

入力:

```json
{
  "domain_id": "db-mcp",
  "guide_id": "ark_i_web_demo"
}
```

戻り値は `metadata.guideAction` としてAmicaへ渡されます。

```json
{
  "type": "start",
  "domainId": "db-mcp",
  "guideId": "ark_i_web_demo",
  "guide": {
    "deck_id": "ark_i_web_demo",
    "title": "Ark-i Webデモ",
    "slides": []
  }
}
```

## AI Router / 発火ルール

Domainに `Guide MCP` がアタッチされている場合、以下のような発話でGuide MCPが起動します。

例:

```text
Ark-iのWebデモを始めて
ガイドを再生して
プレゼンを開始して
このサービスの説明を流して
展示会デモを見せて
```

現在の実装では、Guide MCP内部で次のように解釈します。

- 「一覧」「どんなガイド」系: `guide_list`
- 「開始」「再生」「プレゼン」「デモ」「説明して」系: `guide_start`
- 「ガイド」「スライド」系: `guide_search`

`guide_start` では `guide_id` が明示されていない場合、検索結果の先頭、またはDomainにアタッチされた最初のGuideを開始します。

## Amica側との接続方針

Amica presentation モードは、既存のプレゼンテーションモーダルをGuide Playerとして流用します。

`guide_start` が発火すると、injection-tool は `metadata.guideAction` にDeck JSONを入れて返します。

Amica側の動作:

1. チャット入力をinjection-toolへ送る
2. Guide MCPが `guide_start` を返す
3. Amicaが `metadata.guideAction` を検出
4. `amica:guide-start` イベントを発火
5. 既存プレゼンテーションモーダルにDeckを読み込む
6. 1ページ目を表示
7. `notes` をTTSへ送る
8. `display_seconds` に合わせて自動ページ切替
9. 最終ページ後はチャットへ戻る

## 実装ファイル

サーバー側:

```text
src/lib/domains.ts
src/lib/guides.ts
src/lib/mcp-runtime.ts
src/lib/mcp-servers.ts
src/lib/intercept-service.ts
src/app/api/guides/route.ts
src/app/api/guides/[id]/route.ts
```

管理画面:

```text
src/app/admin/page.tsx
```

Amica側:

```text
src/features/chat/chat.ts
src/components/messageInput.tsx
src/types/injection.ts
```

## 検証コマンド

```powershell
npx.cmd tsc --noEmit --incremental false --pretty false
```

## 注意事項

- `deck_id` は保存後の更新キーとして使います。
- 既存ガイドの `deck_id` を変更した場合、管理画面上では新規ガイドとして保存される場合があります。
- iframe表示可否は相手サイトのHTTPヘッダーに依存します。
- 画像URLが404の場合、Amica側の画像表示も失敗します。
