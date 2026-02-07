# chronixd

chronixd collects data from various services and outputs NDJSON files.
The output can be queried with DuckDB.

## Supported Services

- [Bluesky](https://bsky.app/)
- [GitHub Activity](https://github.com/)
- [GitHub Search](https://github.com/search)
- [Linear](https://linear.app/)
- iCal calendar (Google Calendar etc.)
- RSS Feeds
- [Location (blued-location)](https://github.com/azu/blued-location)
- [Notion](https://www.notion.so/)
- [Slack](https://slack.com/)

## Usage

### CLI

```bash
CHRONIXD_ENVS='[...]' ./chronixd --output ./db --limit 1000
```

- `--output` (`-o`): Output directory (default: `./db`)
- `--limit` (`-l`): Max fetch count per service (default: `1000`)

Output path: `{output}/{name}/{service}/{year}/{month}.ndjson`

### ENV Configuration

Create `CHRONIXD_ENVS` env var using [chronixd env generator](https://azu.github.io/chronixd/).

Each entry requires a `name` field and service-specific fields:

```json
[
  {
    "name": "my-timeline",
    "bluesky_identifier": "user.bsky.social",
    "bluesky_app_password": "xxx"
  },
  {
    "name": "my-timeline",
    "github_token": "ghp_...",
    "github_username": "azu"
  }
]
```

### via GitHub Actions

chronixd outputs to a separate data repository.

1. Create a data repository
2. Set `DATA_REPOSITORY` as GitHub Variable (e.g. `azu/my-data`)
3. Set `DATA_REPO_TOKEN` as GitHub Secret (token with push access to data repo)
4. Set `CHRONIXD_ENVS` as GitHub Secret

```yaml
name: Update
on:
  schedule:
    - cron: "*/30 0-16,22-23 * * *"
  workflow_dispatch:
env:
  CHRONIXD_VERSION: v3.4.3

permissions:
  contents: none
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout data repo
        uses: actions/checkout@v4
        with:
          repository: ${{ vars.DATA_REPOSITORY }}
          token: ${{ secrets.DATA_REPO_TOKEN }}
          path: data-repo

      - name: Restore cache
        uses: actions/cache/restore@v4
        with:
          path: .cache
          key: chronixd-cache-${{ github.run_id }}
          restore-keys: chronixd-cache-

      - name: Download chronixd
        run: |
          curl -L https://github.com/azu/chronixd/releases/download/${{env.CHRONIXD_VERSION}}/chronixd -o chronixd
          chmod +x chronixd

      - name: Run chronixd
        run: CACHE_DIR=$(pwd)/.cache ./chronixd --output ./data-repo/db > /dev/null 2>&1
        env:
          CHRONIXD_ENVS: ${{ secrets.CHRONIXD_ENVS }}

      - name: Save cache
        uses: actions/cache/save@v4
        with:
          path: .cache
          key: chronixd-cache-${{ github.run_id }}

      - name: Commit and push
        working-directory: data-repo
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add db/ > /dev/null 2>&1
          git diff --cached --quiet 2>/dev/null || git commit -m "chore: update db" > /dev/null 2>&1
          git push > /dev/null 2>&1
```

## Query with DuckDB

```sql
-- Read all Bluesky records
SELECT * FROM read_ndjson('db/my-timeline/bluesky/**/*.ndjson');

-- Read all GitHub events
SELECT * FROM read_ndjson('db/my-timeline/github-events/**/*.ndjson');

-- Search across services with timestamp
SELECT type, unixTimeMs, url
FROM read_ndjson('db/my-timeline/**/*.ndjson')
ORDER BY unixTimeMs DESC
LIMIT 100;
```

Schema definitions are in `src/schema/definitions.ts`. Running chronixd outputs `schema.json` to the output directory.

## Output Format

NDJSON (1 line per record). Each record has common fields and service-specific fields.

Common fields:

- `type`: string
- `unixTimeMs`: number
- `url`: string (optional)

## Cache

Services that use cache-based deduplication (GitHub Search, Calendar, RSS, Linear, Location, Notion) store cache files in `CACHE_DIR` (default: `./.cache`).
GitHub Actions requires `actions/cache` configuration.

## Development

```bash
bun install
```

```bash
# Create .env with CHRONIXD_ENVS
op run --env-file .env -- bun run dry-run
```

## Debug

```bash
DEBUG=1 ./chronixd --output ./db
```

## Release Flow

```
npx npm@latest version {patch,minor,major}
```

`postversion` スクリプトで自動的に `git commit` → `git push --follow-tags` が実行されます。

## License

MIT
