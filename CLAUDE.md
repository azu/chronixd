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
chronixd --output ./path/to/db
```

- `--output` (`-o`): 出力ディレクトリ（デフォルト: `./db`）

## 出力パス

`{output}/{service}/{name}/{year}/{month}.ndjson`

## サービス追加時の更新手順

新しいサービスやオプションを追加した場合:

1. `src/services/*.ts` - サービス実装を追加/更新
2. `src/common/types.ts` - Record型を追加
3. `src/envs.ts` - `SupportedEnv`に型を追加、`typeOfEnv`に分岐を追加
4. `src/index.ts` - `fetchService`に分岐を追加、`SERVICE_DIR_MAP`にマッピング追加
5. `src/schemas/` - DuckDB用SQLスキーマ追加

## キャッシュ

重複防止のため`.cache/`にキャッシュを保存。GitHub Actionsでは`actions/cache`の設定が必要。
