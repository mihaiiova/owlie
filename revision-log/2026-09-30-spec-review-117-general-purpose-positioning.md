# Review: spec-review of #117 (general-purpose web content extractor positioning)

**Date:** 2026-09-30
**Session:** Reviewed `spec/117-general-purpose-positioning` against `development`. The documentation now describes Owlie as a general-purpose web content extractor with two audiences, and `owlie-app` as the first consuming product. ADR 0034 records the positioning and the "useful beyond one consumer" rule. `cli-contract.md` gains an integrator guide. The `--help` heading and package metadata change; there are no behaviour changes. `pnpm check` passes.

## History Checked

- 2026-09-22-spec-review-112-batch-progress.md
- 2026-09-21-spec-review-110-bounded-feed-discovery.md
- 2026-09-21-spec-review-109-provenance-capabilities.md

## Spec Coverage

| Decision                                                      | Status                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Canonical purpose sentence (README, AGENTS §1, product scope) | Done                                                                           |
| Short forms (package descriptions, keywords, `--help`)        | Done                                                                           |
| ADR 0034                                                      | Done                                                                           |
| Consumer-neutral boundary docs                                | Done (README, AGENTS §4, architecture, repository boundaries)                  |
| Product scope "Consumer responsibilities"                     | Done                                                                           |
| AGENTS §3 scope wording                                       | Done (webpage non-goal replaced; `owlie-app` integration non-goal dropped)     |
| Integrator guide in `cli-contract.md`                         | Done (proxy variables omitted until #114 ships)                                |
| Contributor surfaces                                          | Done (PR/feature templates, `contributor-flow.md`, core AGENTS, SECURITY)      |
| Migration playbook note                                       | Done                                                                           |
| Historical ADRs and revision logs untouched                   | Confirmed                                                                      |
| README status text                                            | Done (points to changelog)                                                     |
| `owlie-app` grep outside history                              | Only example mentions, migration playbook, and AGENTS §15 (migration workflow) |
| GitHub repository description and topics                      | Pending owner action (suggested values below)                                  |

## Findings

- The README intro promised article URLs while `owlie extract` still sends HTML page URLs to feed discovery (only `owlie process URL` reaches the article adapter). Fixed in review: the README status block now states the gap and points to #118, matching `docs/product-scope.md`.
- `AGENTS.md` §2 still calls the repository a "scaffold". Left unchanged: that is status wording, not positioning, and outside this spec.

## Suggested Repository Metadata (owner action)

- Description: "General-purpose web content extractor: URLs in, normalized content out"
- Topics: `web-content-extraction`, `article-extraction`, `transcripts`, `youtube`, `podcast`, `rss`, `cli`, `llm`

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.2   |
| Repetition         | 0.2   |
| Missing capability | 0.5   |
| Knowledge gap      | 0.3   |
| Fragility          | 0.1   |

## Suggestions

| #   | Category   | Suggestion                                                                                                                             | Score | Accepted? |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | capability | Implement #118 so `owlie extract` returns article pages directly; the positioning depends on it and `owlie-app` #219 is blocked on it. | 0.8   | Accepted  |
| 2   | docs       | Refresh `AGENTS.md` §2 "scaffold" status wording in a later docs pass.                                                                 | 0.3   | Pending   |

## Changes Made

- Added the article-extraction gap note to the README status block.
