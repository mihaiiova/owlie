# ADR 0034 — General-purpose web content extractor; products are consumers

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Owlie CLI grew by porting capabilities out of the private `owlie-app`, and its
documentation described `owlie-app` as _the_ consumer: the README, `AGENTS.md`,
the architecture, and the repository-boundary documents each presented the
subprocess contract (hosted mode, the JSON protocol, job controls,
capabilities) as if it existed for that one product. The purpose statements
also listed only YouTube, podcasts, Reddit, and RSS/Atom, and a v1 non-goal
("generic webpage extraction") contradicted the article adapter that already
extracts supplied pages.

Owlie is meant to be a general-purpose web content extractor with more than one
kind of user.

## Decision

- Owlie CLI is an open-source, general-purpose web content extractor: given a
  URL (an article, a video, a podcast episode, a feed, or a discussion), it
  returns normalized, provenance-stamped content, and it can process that
  content with an LLM the user chooses.
- It serves two audiences: people running it interactively, and products that
  run the published `owlie` command as a subprocess. `owlie-app` is the first
  such product; others may follow.
- The integration contract (`--hosted`, the versioned `--json` protocol,
  invocation-wide job controls, `owlie capabilities`) is the same public
  contract for every consumer, documented in `cli-contract.md`.
- A new capability must make sense for a consumer other than `owlie-app`.
  Consumer-specific policy, including identity and de-duplication rules,
  retries, pricing, storage, and scheduling, stays in the consumer.
- Extracting a supplied web page URL is in scope. Crawling, following links,
  browser/JavaScript rendering, and logged-in or paywalled pages are not.
- This refines ADR 0001 and ADR 0004. Earlier ADRs and revision logs that name
  `owlie-app` remain accurate historical records; read their `owlie-app`
  references as examples of a consuming product.

## Consequences

- Documentation, templates, and package metadata describe consumers
  generically and name `owlie-app` only as the first example.
- Specs for new CLI capabilities are justified by general use, not by one
  product's needs.
- The migration playbook remains specific to porting from `owlie-app`, and
  requires ported behaviour to be generalised.
