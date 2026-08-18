# ADR 0003 — No database, scheduler, monitoring, or daemon in v1

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

A hosted product would naturally persist feeds, schedule jobs, and monitor
sources. Owlie CLI is local-first and stateless by design.

## Decision

Exclude from v1:

- source monitoring;
- scheduled or recurring execution;
- cron management;
- background daemons;
- a local database;
- persistent job records.

The CLI performs explicit, bounded, one-shot operations requested by the user.
Scheduling and monitoring remain `owlie-app` responsibilities.

## Consequences

- No persistence layer, no state written into the repository or working
  directory unless explicitly requested.
- Simpler security and operational surface (no daemon to secure).
- A future decision may revisit local caching, but only as an explicit,
  bounded feature — not as implicit background state.
