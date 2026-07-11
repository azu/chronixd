# CLAUDE.md

## プロジェクト概要

chronixd: 各種サービスのデータをNDJSON形式でファイル出力するCLIツール

## 開発コマンド

```bash
# テスト
bun run test

# Lint
bun run lint

# dry-run（ファイル書き込みしない）
op run --env-file .env -- bun run dry-run

# 本番実行
op run --env-file .env -- bun run main
```

## 環境変数

- `CHRONIXD_ENVS`: JSON配列。各要素に`name`フィールドが必須
- `CHRONIXD_DRY_RUN`: `true`でファイル書き込みをスキップ
- `CACHE_DIR`: キャッシュディレクトリ（デフォルト: `./cache`）
- `OP_SERVICE_ACCOUNT_TOKEN`: Oura OAuth tokenを取得・更新する1Password CLIの認証token

## CLI引数

```
chronixd --output ./path/to/db --limit 1000
```

- `--output` (`-o`): 出力ディレクトリ（デフォルト: `./db`）
- `--limit` (`-l`): 1サービスあたりの最大取得件数（デフォルト: `1000`）

## 出力パス

`{output}/{service}/{name}/{year}/{month}.ndjson`

## サービス追加時の更新手順

新しいサービスやオプションを追加した場合:

1. `src/services/*.ts` - サービス実装を追加/更新
2. `src/common/types.ts` - Record型を追加
3. `src/envs.ts` - `SupportedEnv`に型を追加、`typeOfEnv`に分岐を追加
4. `src/pull.ts` - `services`配列にサービスを追加（`SERVICE_DIR_MAP`はスキーマ定義から自動生成）
5. `src/schema/definitions.ts` - スキーマ定義を追加
6. `index.html` - ENV GeneratorのSERVICESにフィールド定義を追加
7. `README.md` - Supported Servicesセクションにサービス説明を追加

## リリース

```bash
# パッチリリース（例: 3.4.0 → 3.4.1）
npx npm@latest version patch

# マイナーリリース（例: 3.4.0 → 3.5.0）
npx npm@latest version minor

# メジャーリリース（例: 3.4.0 → 4.0.0）
npx npm@latest version major
```

`postversion`スクリプトで`sync-version` → `git commit` → `git push --follow-tags`が自動実行される。

## リトライ

リトライは2層に分かれている。サービスの種類に応じてどちらか一方が担当する。

- raw fetchを使うサービスは `fetchWithRetry`（`src/common/fetchWithRetry.ts`）を使う
  - 429/503のRetry-Afterヘッダー、5xx、ネットワークエラーを自動リトライする
  - サービス内で独自のリトライを実装しない
  - 例外: Oura OAuth refresh tokenはsingle-useのため、token POSTを再試行しない
- ライブラリ利用サービス（Octokit, @notionhq/client等）は `processEnv`（`src/pull.ts`）の共通リトライに任せる
  - RetryAbleErrorとネットワークエラー（TypeError）をリトライする

リトライ回数はデフォルト2回。`CHRONIXD_RETRY_COUNT`環境変数で変更可能。

## キャッシュ

重複防止キャッシュは`CACHE_DIR`（デフォルト`./cache`）に保存。Ouraの回転OAuth tokenはキャッシュではなく、実行環境にかかわらず1Passwordを正本として取得・更新し、GitHub Actions cacheには保存しない。
