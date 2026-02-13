# Architecture

This document describes the linkedin-cli codebase structure, module responsibilities, and data flow. It is intended for contributors and AI models navigating the code.

## Directory Structure

```
src/
  index.ts              # CLI entry point, commander setup, global hooks
  core/
    browser.ts          # Playwright browser launch, auth context, auth check
    session.ts          # Cookie/session storage, import, expiry checks (Zod-validated)
    linkedin.ts         # All LinkedIn scraping logic (~1750 lines, the core engine)
  commands/
    auth.ts             # auth login/logout/status/import-cookies + config show/set/clear-cache
    profile.ts          # profile get (basic, detailed, screenshot)
    search.ts           # search people
    posts.ts            # posts list (with --watch mode)
    network.ts          # network mutuals/warm-paths/connections
    company.ts          # company get
    jobs.ts             # jobs search
    message.ts          # message list/send
    connect.ts          # connect (connection request)
    batch.ts            # batch profiles
    url.ts              # url profile/post/company (URL builders)
  utils/
    cache.ts            # File-based cache with SHA-256 keys and TTL
    config.ts           # Zod-validated config file at ~/.linkedin-cli/config.json
    delay.ts            # Randomized delays for anti-detection
    format.ts           # Output engine: JSON, CSV, TSV, text, templates
    lifecycle.ts        # Browser tracking + SIGINT/SIGTERM cleanup
    logger.ts           # Verbose debug logging to stderr
    options.ts          # Shared CLI option definitions and parsers
    output.ts           # outputResult() -- format + write to stdout or file
    progress.ts         # TTY-aware spinner (ANSI escape codes on TTY, plain on pipe)
    prompt.ts           # Interactive stdin prompt (waitForEnter)
test/
  linkedin-core.test.ts # Unit tests for URL builders, formatting, warm-path scoring
extension/
  chrome/               # Chrome MV3 cookie export extension
  firefox/              # Firefox cookie export extension
```

## Module Dependency Graph

```
index.ts
  ├── commands/*         (each command file)
  │     ├── core/browser.ts    (launch browser, assert auth)
  │     ├── core/linkedin.ts   (scraping functions)
  │     ├── utils/cache.ts     (read/write cache)
  │     ├── utils/config.ts    (load config)
  │     ├── utils/options.ts   (CLI option helpers)
  │     ├── utils/output.ts    (format + print/write)
  │     └── utils/progress.ts  (spinner)
  ├── utils/lifecycle.ts       (signal handlers)
  ├── utils/config.ts          (preAction hook loads config)
  └── utils/delay.ts           (preAction hook sets delay range)

core/browser.ts
  ├── core/session.ts          (check session exists, expiry)
  ├── utils/logger.ts
  └── utils/lifecycle.ts       (track browser for cleanup)

core/linkedin.ts
  ├── utils/logger.ts
  └── utils/delay.ts           (randomDelay, randomScrollPixels)

utils/format.ts                (pure functions, no dependencies)
utils/output.ts → utils/format.ts
utils/cache.ts → utils/logger.ts
utils/config.ts                (standalone, uses zod)
utils/lifecycle.ts → utils/logger.ts
```

## Data Flow

### Typical command execution

```
1. index.ts: parseAsync()
2. preAction hook: loadConfig() → setDelayRange()
3. Command action:
   a. Check cache (if applicable, before browser launch)
   b. launchAuthenticatedContext() → Playwright browser + page with session cookies
   c. assertAuthenticated() → navigate to /feed/, check for /login redirect
   d. Core scraping function (e.g., getProfile, searchPeople)
   e. outputResult() → formatOutput() → stdout or file
   f. finally: browser.close()
```

### Session lifecycle

```
auth login:    Browser opens → user logs in → storageState saved to ~/.linkedin-cli/storageState.json
auth import:   JSON file → Zod validate → filter LinkedIn cookies → save storageState
Every command:  sessionExists() → checkSessionExpiry() → launchBrowser with storageState
```

### Caching

```
getCached(namespace, key):
  1. SHA-256 hash of "namespace:key" → ~/.linkedin-cli/cache/<namespace>-<hash>.json
  2. Read file, check TTL, return data or null

setCache(namespace, key, data, ttlMs):
  1. Write { data, cachedAt, ttlMs } to cache file
```

## Key Design Decisions

### Single-page scraping
All scraping uses a single Playwright `Page` instance per command. This means LinkedIn sees one "tab" with realistic navigation patterns. The trade-off is that operations are sequential -- you can't scrape two profiles in parallel from the same session.

### Anti-detection
- All `waitForTimeout` calls use `randomDelay(min, max)` with configurable ranges
- Scroll amounts use `randomScrollPixels()` with viewport-based jitter
- Configurable delay range via `config set delay.minMs/maxMs`
- Batch operations add inter-request delays from config

### URL validation
Every navigation to a user-provided URL calls `assertLinkedInUrl()` which verifies the hostname is exactly `linkedin.com` or `*.linkedin.com`. This prevents SSRF-style attacks where an authenticated browser is directed to a non-LinkedIn domain.

### Resource cleanup
- Every command wraps browser usage in `try/finally { browser.close() }`
- `lifecycle.ts` tracks all active browsers and installs SIGINT/SIGTERM handlers
- `launchAuthenticatedContext` closes the browser if context creation fails
- Watch mode uses `untrackBrowser()` to manage its own lifecycle without double-close races

### Error handling patterns
- `page.evaluate().catch(() => [])` -- DOM scraping never crashes the tool; returns empty data
- Commands use `progress.stop("Failed.")` in catch blocks before re-throwing
- Batch operations catch per-item errors and continue, collecting failures separately
- Top-level `main().catch()` in index.ts prevents unhandled rejections

## Core Module: linkedin.ts

This is the largest file (~1750 lines) and contains all LinkedIn-specific logic. Key sections:

| Section | Functions | Lines |
|---------|-----------|-------|
| URL helpers | `buildPeopleSearchUrl`, `normalizeProfileUrl`, `toCanonicalProfileUrl`, `toCanonicalCompanyUrl`, `assertLinkedInUrl` | ~150-220 |
| Text parsing | `inferDegree`, `parseSearchCardText` | ~225-300 |
| Card scraping | `scrapeRawPeopleCards`, `rawPeopleCardsToResults` | ~300-380 |
| Pagination | `collectPeopleResultsByPageNumber` | ~380-445 |
| Scoring | `tokenize`, `sharedTokenCount`, `buildWarmIntroPathsFromMutuals` | ~445-530 |
| Mutual connections | `resolveMutualConnectionsSearchUrl`, `resolveProfileEntityId`, `scrapeVisibleMutualConnections` | ~535-640 |
| Profile resolution | `resolveMyProfileUrl` | ~645-720 |
| People search | `searchPeople` | ~725-780 |
| Mutual connections (public) | `getMutualConnections` | ~785-825 |
| Warm paths | `getWarmIntroPaths` | ~830-855 |
| Profile scraping | `getProfile`, `getDetailedProfile`, `scrapeExperience`, `scrapeEducation`, `scrapeSkills` | ~860-1055 |
| Posts | `listPosts` | ~1060-1170 |
| Connections | `listConnections` | ~1175-1255 |
| Company | `getCompanyProfile` | ~1260-1335 |
| Jobs | `searchJobs` | ~1340-1455 |
| Messages | `listMessages`, `sendMessage` | ~1460-1565 |
| Connect | `sendConnectionRequest` | ~1570-1655 |
| Screenshot | `screenshotProfile` | ~1660-1680 |
| URL builders | `buildProfileUrl`, `buildPostUrl`, `buildCompanyUrl` | ~1685-1755 |

### Scraping pattern

Most scraping functions follow this pattern:

```typescript
export async function scrapeX(page: Page, url: string, limit: number): Promise<Result[]> {
  // 1. Validate and normalize URL
  assertLinkedInUrl(url);

  // 2. Navigate
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await randomDelay(800, 1500);

  // 3. Scroll-and-collect loop
  const seen = new Map<string, Result>();
  for (let round = 0; round < maxRounds; round++) {
    const items = await page.evaluate(() => { /* DOM extraction */ }).catch(() => []);
    // deduplicate into `seen`
    if (seen.size >= limit || stableRounds >= threshold) break;
    await page.evaluate(px => window.scrollBy(0, px), randomScrollPixels());
    await randomDelay(700, 1300);
  }

  return Array.from(seen.values()).slice(0, limit);
}
```

## Testing

Tests are in `test/linkedin-core.test.ts` using Vitest. They cover:

- URL builders (profile, post, company) -- canonical URL generation and validation
- People search URL construction with network/location filters
- Warm intro path scoring and ranking
- Output formatting (JSON, CSV, TSV, text, empty arrays, nested objects, CSV escaping)
- Template interpolation (simple, missing keys, nested paths)

Tests do NOT require a LinkedIn session -- they test pure functions only.

## Config Schema

Validated with Zod in `utils/config.ts`:

```typescript
{
  browser: "chromium" | "firefox" | "webkit",  // default: "chromium"
  headed: boolean,                              // default: false
  defaultLimit: number,                         // default: 10 (positive int)
  delay: { minMs: number, maxMs: number },      // default: { 800, 2500 }
  cache: { enabled: boolean, ttlMinutes: number }, // default: { true, 1440 }
  output: "text" | "json" | "csv" | "tsv",     // default: "text"
  verbose: boolean                              // default: false
}
```

## Session Schema

Validated with Zod in `core/session.ts`. Two schemas:

1. **`storageStateSchema`** -- validates the Playwright storage state file (cookies array + origins)
2. **`cookieExportSchema`** -- validates imported cookie files (array of cookies or `{ cookies: [...] }`)

Cookie import filters to LinkedIn domains only and requires a non-empty, non-expired `li_at` cookie.
