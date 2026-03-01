# chronixd

chronixd collects data from various services and outputs NDJSON files.
The output can be queried with DuckDB.

## Supported Services

<details>
<summary>Bluesky</summary>

[bsky.app](https://bsky.app/) — Collect feed posts.

**Credentials**

Create an app password at [Settings > App Passwords](https://bsky.app/settings/app-passwords).

</details>

<details>
<summary>GitHub Activity / GitHub Search</summary>

[github.com](https://github.com/) — Collect event history and search issues/repositories.

**Credentials**

Create a [Personal Access Token](https://github.com/settings/tokens).

Fine-grained token (single org):

Account permissions:

- Events: Read-only (required for private repository events)

Repository permissions:

- Contents: Read-only
- Issues: Read-only
- Pull requests: Read-only
- Metadata: Read-only (automatically granted)

Classic token (cross org private repos):

Fine-grained tokens are scoped to a single org. To access private repo events across multiple orgs, use a classic token.

- `repo` — required for private repository events

</details>

<details>
<summary>Linear</summary>

[linear.app](https://linear.app/) — Collect assigned/created issues and activity.

**Credentials**

Create a Personal API key at [Settings > Security & Access](https://linear.app/settings).

</details>

<details>
<summary>iCal calendar</summary>

Collect calendar events (next 28 days) from iCal URL. Supports Google Calendar etc.

No token required. Provide the iCal URL only.

</details>

<details>
<summary>RSS Feeds</summary>

Collect feed items from RSS/Atom URLs.

No token required. Provide the feed URL only.

</details>

<details>
<summary>Location (chronixd-location)</summary>

[github.com/azu/chronixd-location](https://github.com/azu/chronixd-location) — Collect GeoJSON location data.

</details>

<details>
<summary>Notion</summary>

[notion.so](https://www.notion.so/) — Collect pages from Notion databases.

**Credentials**

Create an internal integration at [My Integrations](https://www.notion.so/my-integrations). Add the integration to target pages via "Connect to".

</details>

<details>
<summary>Slack</summary>

[slack.com](https://slack.com/) — Search and collect messages matching a query.

**Credentials**

Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps). Add `search:read` to User Token Scopes, then install to your workspace to get a `xoxp-` token.

</details>

<details>
<summary>WakaTime</summary>

[wakatime.com](https://wakatime.com/) — Collect coding duration data.

**Credentials**

Get your API key from [WakaTime Settings](https://wakatime.com/settings/api-key).

</details>

<details>
<summary>Microblog (chronixd-microblog)</summary>

Collect posts from a self-hosted microblog powered by [chronixd-microblog](https://github.com/azu/chronixd-microblog).

**Credentials**

Deploy chronixd-microblog Worker and set the Bearer token.

</details>

<details>
<summary>Bookmarks (asocial-bookmark)</summary>

[github.com/azu/asocial-bookmark](https://github.com/azu/asocial-bookmark) — Collect bookmarks from a GitHub repository managed by asocial-bookmark.

**Credentials**

Create a [fine-grained Personal Access Token](https://github.com/settings/tokens?type=beta) scoped to the bookmark repository.

Repository permissions:

- Contents: Read-only
- Metadata: Read-only (automatically granted)

</details>

## Usage

### CLI

chronixd has two subcommands: `pull` and `generate`.

#### pull (default)

Collect data from services and output NDJSON files.

```bash
CHRONIXD_ENVS='[...]' ./chronixd pull --output ./db --limit 1000
```

- `--output` (`-o`): Output directory (default: `./db`)
- `--limit` (`-l`): Max fetch count per service (default: `1000`)

`pull` is the default subcommand. `./chronixd --output ./db` works the same way.

Output path: `{output}/{service}/{name}/{year}/{month}.ndjson`

#### generate

Generate a static HTML timeline site from NDJSON data.

```bash
./chronixd generate --input ./db --output ./dist --language ja
```

- `--input` (`-i`): Input directory containing NDJSON files (default: `./db`)
- `--output` (`-o`): Output directory for HTML files (default: `./dist`)
- `--language` (`-L`): Language code for HTML lang attribute (default: `ja`)

The generated site includes:

- Day-based timeline pages with service-specific views
- Index page with calendar-like navigation
- Full-text search via [Pagefind](https://pagefind.app/)
- `today.html` pointing to the current day's page
- Post page for microblog integration (when `CHRONIXD_ENVS` contains microblog config)

Each service has a dedicated view: Bluesky, GitHub (grouped by repo), Slack, Calendar, Linear, WakaTime (grouped by session), Location (stay/transit grouping), Bookmark, Microblog. Other services use a default view.

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
  CHRONIXD_VERSION: v5.1.4

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
          curl -L https://github.com/azu/chronixd/releases/download/${{env.CHRONIXD_VERSION}}/chronixd-linux-x64 -o chronixd
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

      - name: Generate static site
        run: ./chronixd generate --input ./db --output ./dist
        env:
          CHRONIXD_ENVS: ${{ secrets.CHRONIXD_ENVS }}

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
# Pull data (dry-run)
op run --env-file .env -- bun run dry-run

# Generate static site
bun run generate

# Dev server with hot reload
bun run generate:dev
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
