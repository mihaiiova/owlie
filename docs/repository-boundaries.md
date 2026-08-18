# Repository boundaries

The open-source `owlie-cli` and the private `owlie-app` interact through the
published `owlie` command, not through library imports:

```text
owlie-app
    ↓ runs `owlie` CLI as a subprocess (typically in a container)
owlie (published package)
```

`owlie-app` does not install or import the internal `@owlieio/*` packages.
Those are private and bundled into `owlie` at build time.

## `owlie-cli` owns

- content and collection types;
- source adapter contracts;
- collection discovery;
- extraction;
- transcription interfaces;
- LLM processing interfaces;
- bounded collection processing;
- collection search;
- progress events;
- output serialization;
- reusable adapters and providers.

## `owlie-app` owns

- the web UI;
- authentication and users;
- billing and credits;
- Postgres persistence;
- hosted job queues and workers;
- source monitoring and schedules;
- notifications;
- hosted media storage and delivery;
- analytics;
- administrative functionality;
- cloud deployment.

## Hard rules

1. `owlie-cli` must never import files or packages from `owlie-app`.
2. The open-source core must never contain hosted concepts such as Owlie user
   IDs, billing or credits, Stripe, Better Auth, Hono HTTP routes, Postgres
   repositories, Railway, Cloudflare R2, PostHog, Resend, hosted feed state,
   hosted playback state, cron jobs, or cloud schedulers.
3. Porting code from `owlie-app` follows `docs/migration-playbook.md` and never
   copies credentials, environment files, user data, database code, billing,
   authentication, analytics, deployment configuration, or private fixtures.
