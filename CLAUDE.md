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
- `CACHE_DIR`: キャッシュディレクトリ（デフォルト: `./.cache`）

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
4. `src/index.ts` - `fetchService`に分岐を追加、`SERVICE_DIR_MAP`にマッピング追加
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

## キャッシュ

重複防止のため`.cache/`にキャッシュを保存。GitHub Actionsでは`actions/cache`の設定が必要。
