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

**Steps**

1. Create app
2. Add `search:read` to User Token Scopes
3. Install App to workspace
4. Copy User OAuth Token

</details>

<details>
<summary>WakaTime</summary>

[wakatime.com](https://wakatime.com/) — Collect coding duration data.

**Credentials**

Get your API key from [WakaTime Settings](https://wakatime.com/settings/api-key).

</details>

<details>
<summary>Oura Ring</summary>

[Oura API V2](https://cloud.ouraring.com/v2/docs) — Collect daily activity, readiness, sleep scores, and detailed sleep periods.

**Credentials**

Oura personal access tokens were retired in December 2025. Create an OAuth application in [My Applications](https://cloud.ouraring.com/oauth/applications) and authorize it with the `daily` scope. See the official [OAuth authentication guide](https://cloud.ouraring.com/docs/authentication) for the authorization-code and token exchange flow.

Configure the initial OAuth access token. For unattended collection, also configure the refresh token, client ID, and client secret together:

```json
{
  "name": "my-ring",
  "oura_access_token": "...",
  "oura_refresh_token": "...",
  "oura_client_id": "...",
  "oura_client_secret": "...",
  "oura_timezone": "Asia/Tokyo"
}
```

Oura refresh tokens are single-use. For local runs, chronixd rotates them after a `401` response and saves the new access/refresh token pair in `OURA_TOKEN_CACHE_DIR` (default: `./.oura-token-cache`) with owner-only file permissions. Persist this directory between local runs and never commit it. Token refresh is intentionally disabled in `CHRONIXD_DRY_RUN` so a single-use token cannot be consumed without saving its replacement.

For GitHub-hosted runners, use the built-in 1Password token store instead of a runner-local file. Create a dedicated 1Password vault and an API Credential item with these exact fields:

| Field | Initial value | Type |
| --- | --- | --- |
| `access_token` | Initial Oura access token | Concealed |
| `refresh_token` | Initial Oura refresh token | Concealed |
| `expires_at` | Empty | Text |
| `refresh_status` | `ready` | Text |

Configure chronixd with the item reference and OAuth application credentials. The rotating access and refresh tokens are loaded from 1Password, so they do not need to be copied into `CHRONIXD_ENVS`:

```json
{
  "name": "my-ring",
  "oura_token_store": "1password",
  "oura_1password_vault": "chronixd",
  "oura_1password_item": "oura-oauth",
  "oura_client_id": "...",
  "oura_client_secret": "...",
  "oura_timezone": "Asia/Tokyo"
}
```

Give a 1Password Service Account only `read_items` and `write_items` access to that dedicated vault. Install the `op` CLI and pass its token as `OP_SERVICE_ACCOUNT_TOKEN`; the [1Password Service Account guide](https://www.1password.dev/service-accounts/get-started) documents these permissions, and the [CLI item reference](https://www.1password.dev/cli/reference/management-commands/item) documents item reads and edits. chronixd sends item JSON to `op item edit` over standard input, so rotated tokens are not placed in command arguments.

Before contacting Oura's token endpoint, chronixd persists `refresh_status=uncertain`. A successful refresh updates the new access/refresh pair and `refresh_status=ready` in the same item edit. If the process stops between those operations, the next run fails closed and requires Oura reauthorization instead of retrying a possibly consumed refresh token.

Store only `OP_SERVICE_ACCOUNT_TOKEN` in GitHub Actions Secrets. `CHRONIXD_ENVS` can be another 1Password field and loaded at runtime. Use one concurrency group for every workflow that writes the Oura item; `cancel-in-progress` must remain false so an active refresh is not interrupted:

```yaml
concurrency:
  group: chronixd-oura-token
  cancel-in-progress: false

steps:
  - name: Install 1Password CLI
    uses: 1password/install-cli-action@a5215d3a7f75c1629216c465ea9ab3ab399c4b71 # v4.0.0

  - name: Run chronixd
    env:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
      CHRONIXD_ENVS: op://chronixd/chronixd-config/CHRONIXD_ENVS
    run: op run -- ./chronixd --output ./db
```

1Password item edits do not provide chronixd with a distributed lock, and GitHub Actions concurrency is repository-scoped. Single-writer operation is therefore a correctness requirement: keep the dedicated Service Account token in one repository, and do not update the same Oura item concurrently from another repository or a local process. See GitHub's [workflow concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). Do not persist either token store with GitHub Actions cache; GitHub's [dependency-cache security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#cache-security) prohibits storing credentials in a cache. A protected self-hosted runner may instead use an explicit durable `OURA_TOKEN_CACHE_DIR`.

The generated Oura NDJSON contains sensitive health data, including the complete API documents. Do not commit it to a public repository; use private storage with access controls. If a refresh is interrupted or its token-state file or 1Password item is lost/corrupted after rotation, reauthorize Oura instead of deleting the state and retrying the old refresh token.

By default, chronixd fetches `daily_activity`, `daily_readiness`, `daily_sleep`, and `sleep`. The first run fetches 30 days, and later runs re-fetch the previous 7 days before upserting by Oura document ID. These defaults can be changed with `oura_data_types`, `oura_history_days`, and `oura_lookback_days`.

If you add a data type to an existing source later, temporarily set `oura_lookback_days` to the number of days you want to backfill for that run. `--limit` is divided fairly across the configured data types; it must be at least the number of selected types.

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
./chronixd generate --input ./db --output ./dist --language ja --timezone Asia/Tokyo
```

- `--input` (`-i`): Input directory containing NDJSON files (default: `./db`)
- `--output` (`-o`): Output directory for HTML files (default: `./dist`)
- `--language`: [BCP 47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag) for HTML lang attribute (default: `ja`)
- `--timezone`: [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for date grouping and time display (default: `Asia/Tokyo`)

The generated site includes:

- Day-based timeline pages with service-specific views
- Index page with calendar-like navigation
- Full-text search via [Pagefind](https://pagefind.app/)
- `today.html` pointing to the current day's page
- Post page for microblog integration (when `CHRONIXD_ENVS` contains microblog config)

Each service has a dedicated view: Bluesky, GitHub (grouped by repo), Slack, Calendar, Linear, WakaTime (grouped by session), Oura, Location (stay/transit grouping), Bookmark, Microblog. Other services use a default view.

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
db/oura/my-ring/2025/01.ndjson
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
  CHRONIXD_VERSION: v5.4.0

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
        run: ./chronixd generate --input ./db --output ./dist --timezone Asia/Tokyo
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

-- Read Oura daily scores and complete API payloads
SELECT day, dataType, score, rawData AS apiDocument
FROM read_ndjson('db/oura/**/*.ndjson')
ORDER BY day DESC;

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

Services that use cache-based deduplication (GitHub Search, Calendar, RSS, Linear, Location, Notion) store cache files in `CACHE_DIR` (default: `./cache`). Oura OAuth tokens are deliberately kept separate in the file token store at `OURA_TOKEN_CACHE_DIR`, or in the 1Password token store.
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
