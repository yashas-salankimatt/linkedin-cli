# linkedin-cli

A browser-backed LinkedIn CLI tool that scrapes profiles, searches people, tracks posts, finds warm intro paths, and more. Uses Playwright for headless browser automation with your real LinkedIn session.

> **Disclaimer**: This project uses browser automation and page scraping, not LinkedIn's official API. LinkedIn may change page structure at any time. You are responsible for complying with LinkedIn's Terms of Service and applicable laws. Session cookies are sensitive credentials -- keep them private.

## Quick Start

```bash
npm install
npx playwright install    # downloads browser binaries
npm run build

# Option A: Interactive login
node dist/index.js auth login

# Option B: Import cookies from a browser extension export
node dist/index.js auth import-cookies --file ./linkedin-cookies.json

# Verify
node dist/index.js auth status

# Try it
node dist/index.js profile get --json
node dist/index.js search people --keywords "founding engineer" --network 1 --limit 5 --json
```

Optional global install:

```bash
npm link
linkedin --help
```

## Commands

### Authentication

```bash
linkedin auth login [--browser chromium|firefox|webkit]   # Interactive browser login
linkedin auth import-cookies --file <path>                 # Import cookies from JSON
linkedin auth status                                       # Show session status & expiry
linkedin auth logout                                       # Delete local session
```

### Profile

```bash
linkedin profile get [--url <profileUrl>] [--detailed] [--screenshot <path>]
```

- Defaults to your own profile if `--url` is omitted
- `--detailed` includes experience, education, and skills
- `--screenshot` saves a full-page PNG

### Search

```bash
linkedin search people --keywords <text> [--network 1|2|3] [--location <text>] [--limit <n>]
```

- `--network` can be repeated: `--network 1 --network 2`
- Client-side location filtering for accuracy

### Posts

```bash
linkedin posts list [--profile <url|me>] [--limit <n>] [--engagement] [--watch <minutes>]
```

- `--engagement` includes reaction and comment counts
- `--watch 5` polls every 5 minutes for new posts (Ctrl+C to stop)

### Network

```bash
linkedin network mutuals --target <profileUrl> [--limit <n>]
linkedin network warm-paths --target <profileUrl> [--limit <n>]
linkedin network connections [--limit <n>]
```

- `warm-paths` ranks mutual connections by shared context (headline, location, connection degree) to suggest the best intro paths
- `connections` exports your full 1st-degree connection list

### Company

```bash
linkedin company get --url <companyUrl|slug>
```

- Accepts full URL or just the company slug (e.g., `google`)

### Jobs

```bash
linkedin jobs search --keywords <text> [--location <text>] [--remote] [--limit <n>]
```

### Messaging

```bash
linkedin message list [--limit <n>]
linkedin message send --to <profileUrl> --text <message>
```

### Connection Requests

```bash
linkedin connect --to <profileUrl> [--note <text>]
```

### Batch Operations

```bash
linkedin batch profiles --file <path> [--detailed] [--limit <n>]
```

- Input file: one URL per line, lines starting with `#` are skipped
- Automatic rate limiting between requests
- Deduplicates URLs, reports failures separately

### URL Builders

```bash
linkedin url profile --id <vanityName>
linkedin url post --activity <id|urn|url>
linkedin url company --id <slug|url>
```

### Configuration

```bash
linkedin config show
linkedin config set <key> <value>     # e.g., config set delay.minMs 1000
linkedin config clear-cache
```

## Output Formats

Every command supports multiple output formats:

```bash
--format text|json|csv|tsv   # Output format (default: text)
--json                       # Shorthand for --format json
--template '{{name}}\t{{headline}}'   # Custom template with {{field}} interpolation
--output <file>              # Write to file instead of stdout
```

Template interpolation supports nested paths: `{{via.name}}`, `{{experience.0.title}}`.

## Global Options

```bash
-v, --verbose     # Debug logging to stderr
--browser <name>  # chromium (default), firefox, or webkit
--headed          # Run browser visibly (not headless)
--no-cache        # Skip cache for this command
```

## Configuration File

Stored at `~/.linkedin-cli/config.json`. Defaults:

```json
{
  "browser": "chromium",
  "headed": false,
  "defaultLimit": 10,
  "delay": { "minMs": 800, "maxMs": 2500 },
  "cache": { "enabled": true, "ttlMinutes": 1440 },
  "output": "text",
  "verbose": false
}
```

## Data Storage

| Path | Purpose | Permissions |
|------|---------|-------------|
| `~/.linkedin-cli/storageState.json` | Browser session (cookies) | `0600` |
| `~/.linkedin-cli/config.json` | CLI configuration | `0600` |
| `~/.linkedin-cli/cache/` | Cached scrape results | `0700` dir, `0600` files |

## Browser Extensions

Cookie-export browser extensions are included for bootstrapping auth:

- **Chrome**: `extension/chrome/` -- load as unpacked extension
- **Firefox**: `extension/firefox/` -- load as temporary add-on

Click the extension icon on any LinkedIn page to export cookies, then import with `linkedin auth import-cookies`.

## Development

```bash
npm run dev          # Run via tsx (no build step)
npm run build        # Compile TypeScript
npm test             # Run unit tests (vitest)
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed codebase walkthrough.

## License

MIT
