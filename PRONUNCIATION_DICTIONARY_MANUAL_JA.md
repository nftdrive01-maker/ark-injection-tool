# 発話辞書運用マニュアル

この文書は、Ark-i の既定発話辞書がどこにあり、何を公開物として管理し、どう更新するかを整理したものです。

## 結論

- 公開している既定発話辞書の本体は `data/pronunciations.json` です
- `injection-tool` は `.env.local` の `INJECTION_PRONUNCIATIONS_CONFIG` でこのファイルを読み込みます
- 既定辞書として公開・配布したい変更は `data/pronunciations.json` を commit / push してください
- ローカル専用の読み替えにしたい場合は、別ファイルへ切り替えるか、変更を commit しない運用にしてください

## 既定発話辞書の保存場所

既定の読み込み先:

```env
INJECTION_PRONUNCIATIONS_CONFIG=./data/pronunciations.json
```

この設定は `injection-tool/.env.local` にあり、実体は次のファイルです。

- `data/pronunciations.json`

アプリ側では `src/lib/pronunciations.ts` からこのファイルを読み込みます。

## 辞書の使われ方

辞書ルールは次の流れで利用されます。

1. `injection-tool` が `data/pronunciations.json` を読む
2. 有効なルールを優先度順で並べる
3. `domainId` が指定されている場合は、そのドメイン専用ルールも絞り込む
4. 公開用には `/api/public/pronunciations` から配信される
5. Amica 側では必要に応じてフォールバック読み辞書も併用する

補足:

- 主辞書は `injection-tool/data/pronunciations.json`
- 最低限の保険になるフォールバックは `amica/src/utils/config.ts` の `injection_tts_pronunciation_fallback_rules`
- 発話品質を改善する主な更新対象は `data/pronunciations.json` です

## JSON 形式

基本形:

```json
[
  {
    "id": "ark_i",
    "from": "Ark-i",
    "to": "アークインジェクション",
    "enabled": true,
    "priority": 100,
    "updatedAt": "2026-06-01T00:00:00.000Z"
  }
]
```

主な項目:

- `id`: ルールID
- `from`: 変換前の文字列
- `to`: 変換後の読み
- `enabled`: 有効/無効
- `priority`: 大きいほど先に適用
- `domainId`: 特定ドメインだけに効かせたい場合に指定
- `updatedAt`: 更新日時

## 更新方法

### 方法 1. 管理画面から更新する

小さな修正や確認しながらの更新なら、この方法が一番安全です。

手順:

1. `injection-tool` を起動する
2. `http://localhost:4001/admin` にログインする
3. `発音辞書` タブを開く
4. ルールを追加・編集・削除する
5. 必要なら `WanaKana` 補助変換設定も保存する

この操作で `data/pronunciations.json` と設定ファイルが更新されます。

### 方法 2. JSON を直接編集する

大量追加や一括置換をしたい場合は、`data/pronunciations.json` を直接編集します。

向いているケース:

- ルールをまとめて大量投入したい
- 他の辞書から変換したい
- pull request 上で差分レビューしたい

編集後は、管理画面または API で結果を確認してください。

## 公開したい場合の更新手順

既定辞書として他環境にも配りたい変更は、次の手順で反映します。

1. `data/pronunciations.json` を更新する
2. ローカルで発話結果を確認する
3. `git status` で `data/pronunciations.json` の差分を確認する
4. commit / push する

このファイルは git 追跡対象なので、push した内容が公開リポジトリ上の既定発話辞書になります。

## ローカル専用にしたい場合

公開したくない辞書は、既定ファイルを直接育てないほうが安全です。

選択肢:

1. `INJECTION_PRONUNCIATIONS_CONFIG` を別ファイルへ向ける
2. `data/pronunciations.json` をローカルでだけ変更し、commit しない

例:

```env
INJECTION_PRONUNCIATIONS_CONFIG=./data/pronunciations.local.json
```

## 動作確認

管理画面:

- `発音辞書` タブのプレビューを使う

API:

```text
GET /api/public/pronunciations
GET /api/public/pronunciations?domainId=<domain-id>
```

このレスポンスには、公開対象の有効な辞書ルールと `wanaKanaEnabled` 設定が入ります。

## 運用上の注意

- 優先度が高いルールほど先に当たるため、広すぎる文字列は慎重に入れてください
- 一般名詞の置換は副作用が大きいので、必要なら `domainId` で範囲を絞ってください
- `amica` 側にもフォールバック辞書はありますが、主運用は `injection-tool/data/pronunciations.json` を正にしてください
- 発話品質に重要な辞書なので、公開既定値にしたい変更は commit / push して履歴を残してください