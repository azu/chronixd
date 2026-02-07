# chronixd

chronixd collects data from various services and outputs NDJSON files.
The output can be queried with DuckDB.

## Supported Services

- [Bluesky](https://bsky.app/)
  <details><summary>Credentials</summary>

  Create an app password at [Settings > App Passwords](https://bsky.app/settings/app-passwords).
  </details>
- [GitHub Activity](https://github.com/) / [GitHub Search](https://github.com/search)
  <details><summary>Credentials</summary>

  Create a [Personal Access Token](https://github.com/settings/tokens).
  </details>
- [Linear](https://linear.app/)
  <details><summary>Credentials</summary>

  Create a Personal API key at [Settings > Security & Access](https://linear.app/settings).
  </details>
- iCal calendar (Google Calendar etc.) — iCal URL only, no token required
- RSS Feeds — Feed URL only, no token required
- [Location (blued-location)](https://github.com/azu/blued-location)
- [Notion](https://www.notion.so/)
  <details><summary>Credentials</summary>

  Create an internal integration at [My Integrations](https://www.notion.so/my-integrations). Add the integration to target pages via "Connect to".
  </details>
- [Slack](https://slack.com/)
  <details><summary>Credentials</summary>

  Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps). Add `search:read` to User Token Scopes, then install to your workspace to get a `xoxp-` token.
  </details>

## Usage

### CLI

```bash
CHRONIXD_ENVS='[...]' ./chronixd --output ./db --limit 1000
```

- `--output` (`-o`): Output directory (default: `./db`)
- `--limit` (`-l`): Max fetch count per service (default: `1000`)

Output path: `{output}/{service}/{name}/{year}/{month}.ndjson`

### ENV Configuration

Create `CHRONIXD_ENVS` env var using [chronixd env generator](https://azu.github.io/chronixd/).

Each entry requires a `name` field and service-specific fields:

```json
[
  {
    "name": "your-name",
    "bluesky_identifier": "user.bsky.social",
    "bluesky_app_password": "xxx"
  },
  {
    "name": "your-name",
    "github_token": "ghp_...",
    "github_username": "username"
  }
]
```

Output example:

```
db/bluesky/your-name/2025/01.ndjson
db/github-events/your-name/2025/01.ndjson
```

### via GitHub Actions

1. Set `CHRONIXD_ENVS` as GitHub Secret

```yaml
name: Update
on:
  schedule:
    - cron: "*/30 0-16,22-23 * * *" # Every 30 minutes (UTC 0-16, 22-23 = JST 9-25)
  workflow_dispatch:
env:
  CHRONIXD_VERSION: v3.5.2

permissions:
  contents: write
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

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
        run: CACHE_DIR=$(pwd)/.cache ./chronixd --output ./db > /dev/null 2>&1
        env:
          CHRONIXD_ENVS: ${{ secrets.CHRONIXD_ENVS }}

      - name: Save cache
        uses: actions/cache/save@v4
        with:
          path: .cache
          key: chronixd-cache-${{ github.run_id }}

      - name: Commit and push
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

`postversion` script automatically runs `git commit` → `git push --follow-tags`.

## License

MIT
