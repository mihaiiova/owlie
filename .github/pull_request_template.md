## Summary

<!-- What does this change and why? Link related issues. -->

## Checklist

- [ ] `pnpm check` passes locally
- [ ] Tests added or updated for the change
- [ ] Documentation and ADRs updated where behavior or architecture changed
- [ ] Dependency-direction rules respected (see `pnpm check:deps`)
- [ ] No credentials, tokens, or private data added
- [ ] No real network calls added to the default test suite
- [ ] No unrelated user changes bundled in this branch

## Scope confirmation

- [ ] This change stays within the documented v1 boundaries
- [ ] This change does not pull hosted `owlie-app` concepts (auth, billing,
      scheduling, databases, cloud) into `owlie-cli`

## How to verify

<!-- Commands a reviewer can run to confirm the change. -->
