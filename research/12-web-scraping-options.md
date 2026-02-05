# Web Scraping Options for Cortex

**Date**: 2026-02-04
**Status**: Research complete, MCP installed, code-level scraper pending

## Decision Summary

**Hybrid approach**: MCP for interactive use + code-level scraper for runtime agents.

## What's Installed

### Playwright MCP (via `.mcp.json`)
- Microsoft-maintained, 25+ browser tools
- Uses accessibility tree (fast, no vision model needed)
- 5 connection modes: persistent profile, isolated, browser extension, CDP, remote server
- Claude Code can browse the web during sessions immediately

## Code-Level Scraper (to build)

Tiered architecture for `src/integrations/web-scraper.ts`:

| Tier | Tool | When |
|---|---|---|
| 1. Fast fetch | `fetch()` + `cheerio` + `@mozilla/readability` + `linkedom` | Default -- 80% of pages |
| 2. JS-rendered | `playwright-core` headless | SPAs, JS-heavy pages |
| 3. Authenticated | Playwright `connectOverCDP()` | Logged-in pages |
| 4. Deep crawl | `crawlee` (PlaywrightCrawler) | Multi-page research |

### Dependencies to add
```
cheerio                  # HTML parsing (jQuery-like, 8x faster than JSDOM)
@mozilla/readability     # Article extraction (Firefox Reader View algorithm)
linkedom                 # Lightweight DOM for Readability (fast, no JSDOM)
playwright-core          # Browser automation (no bundled browser)
robots-parser            # robots.txt compliance
```

Later (when deep crawl needed):
```
crawlee                  # Crawling framework with queuing, retries, rate limiting
```

## Session Reuse Strategy

### Chrome Debug Profile (recommended)
```bash
# Windows -- launch Chrome with debug port
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\tmp\cortex-chrome"
```

- Log into sites once in that profile
- Both MCP (Playwright) and code-level scraper connect via CDP
- Chrome 136+ requires separate `--user-data-dir` (can't use default profile)
- Verify: open `http://localhost:9222/json/version`

### Playwright CDP connection
```typescript
import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0]; // existing context with cookies
```

### Alternative: Browser MCP Extension
- Install Browser MCP Chrome extension in daily driver
- Exposes real tabs/sessions to Claude Code
- Simplest auth story but only works for MCP, not runtime agents

## MCP Options Considered

| Server | By | Verdict |
|---|---|---|
| **Playwright MCP** | Microsoft | **Chosen** -- best balance of features, connection modes, maintenance |
| Chrome DevTools MCP | Google | Strong alternative, 26 tools, needs Chrome 144+ for auto-connect |
| Browser MCP | Community | Good for real-browser fingerprint, less mature |
| Browser-Use | Community | Cloud profiles interesting, but adds LLM dependency |
| BrowserTools | AgentDesk | Best for debugging/auditing, not general scraping |
| Bright Data | Bright Data | Professional anti-bot, but paid and data leaves machine |

## Architecture

```
[Claude Code session]          [Runtime agents (cron/Slack)]
        |                              |
  [Playwright MCP]          [src/integrations/web-scraper.ts]
        |                              |
        +---------- Both connect ------+
                       |
              [Chrome Debug Profile]
              (port 9222, logged in)
                       |
            ┌──────────┼──────────┐
            │          │          │
         Tier 1     Tier 2     Tier 3
       fetch+parse  Playwright   Crawlee
       (no browser) (headless)  (deep crawl)
```

## Security Notes

- CDP has full access to all browser content -- bind to localhost only
- Never commit cookies or session tokens
- Chrome 136 security change (separate user-data-dir) exists for good reason
- Cookie extraction libraries may trigger antivirus alerts
- `--remote-debugging-port` binds to localhost by default -- never use `--remote-debugging-address=0.0.0.0`
