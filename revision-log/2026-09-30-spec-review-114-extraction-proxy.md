# Review: spec-review of #114 (proxy for all extraction traffic)

**Date:** 2026-09-30
**Session:** Reviewed `spec/114-extraction-proxy` against `development`. One proxy, set through `OWLIE_PROXY_URL` or the `OWLIE_WEBSHARE_PROXY_*` pair (also in hosted mode) or the saved `proxy` locally, now carries all extraction traffic through one shared fetcher. `pnpm check` passes (992 tests). The built binary was run with `OWLIE_PROXY_URL` against a local CONNECT proxy: the request was tunnelled with Basic proxy credentials, the article came back through the proxy, and the credential never appeared in stdout or stderr.

## History Checked

- 2026-09-30-spec-review-118-extract-article-pages.md
- 2026-09-30-spec-review-117-general-purpose-positioning.md
- 2026-09-18-spec-review-106-hosted-cli-mode.md

## Spec Coverage

| Decision                                                          | Status                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Env variables, conflicts and partial pairs as errors              | Done; errors name variables, never values                                              |
| No command-line flag                                              | Done                                                                                   |
| Precedence; hosted reads process env only                         | Done (each source read as a whole; first source with any proxy variable wins)          |
| All extraction traffic through the proxy                          | Done (`extract`, `list`, `resolve`, `process` URL and `--each`; one shared fetcher)    |
| Provider calls and model discovery stay direct                    | Done (catalogs and processors keep their own fetchers)                                 |
| Wiring without SDK types in core                                  | Done (`apps/cli/src/proxy.ts`; undici loaded only when a proxy is set)                 |
| Webshare rotating endpoint for non-YouTube traffic                | Done; YouTube keeps the library's Webshare config                                      |
| SSRF check before proxied requests                                | Done (tested: private and metadata destinations refused before the proxy is contacted) |
| Proxy errors map to `EXTRACTION_ERROR`, redacted                  | Done (core fetch errors; credentials never serialized)                                 |
| `doctor` proxy report                                             | Done, plus an `invalid` mode with the error message                                    |
| Setup help, `configuration.md`, `cli-contract.md`, ADR, changeset | Done (ADR 0036; ADR 0008 marked superseded in scope; minor changeset)                  |

## Findings

- With a proxy URL, YouTube now uses the CLI's proxied fetch instead of the library's `GenericProxyConfig`. This makes `socks5://` work for YouTube, which the library's HTTP-only proxy agent did not. The YouTube adapter gained an optional `fetchFn` pass-through for this.
- `doctor` gained `mode: "invalid"` (with the error) beyond the spec's three modes, so a misconfigured proxy is visible in diagnostics without failing `doctor`.
- A saved generic proxy URL is now validated for its scheme. A previously saved unsupported scheme fails extraction with a clear configuration error instead of being silently passed to the library.
- Behaviour change for local users: a proxy saved by `owlie setup` now applies to articles, feeds, and media as well as YouTube. Documented in ADR 0036 and the changeset.
- Review fix: a proxy URL built two proxied fetches (two connection pools). They now share one.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.2   |
| Knowledge gap      | 0.3   |
| Fragility          | 0.3   |

## Suggestions

| #   | Category   | Suggestion                                                                                              | Score | Accepted? |
| --- | ---------- | ------------------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | testing    | Add an opt-in live test that extracts a YouTube transcript through a real proxy from `OWLIE_PROXY_URL`. | 0.5   | Pending   |
| 2   | capability | Connect-time SSRF enforcement is still deferred (ADR 0015); the proxy widens that window.               | 0.3   | Pending   |

## Changes Made

- Shared one proxied fetch between the extraction fetcher and the YouTube client.
