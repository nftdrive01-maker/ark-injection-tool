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

## Amica側との接続方針

現時点の Amica presentation モードは、固定サンプルDeckを読み込む実装です。

次の段階では、injection-tool の `/api/guides` または公開用APIからDeck JSONを取得し、Amica側の固定サンプルを置き換える想定です。

想定フロー:

1. injection-tool のガイド管理でDeckを作成
2. `data/guides.json` に保存
3. Amicaが対象Deckを取得
4. presentationモードで表示・自動送り・TTS発話

## 実装ファイル

サーバー側:

```text
src/lib/guides.ts
src/app/api/guides/route.ts
src/app/api/guides/[id]/route.ts
```

管理画面:

```text
src/app/admin/page.tsx
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
