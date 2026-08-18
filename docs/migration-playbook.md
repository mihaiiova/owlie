# Migration playbook

Porting a capability from `owlie-app` into `owlie-cli` follows these steps.

1. **Select one narrow capability.** Pick a single, well-bounded behavior
   (for example, Reddit subreddit URL normalization).
2. **Record observable behavior.** Document inputs, outputs, identities, and
   edge cases from the private implementation.
3. **Create sanitized fixtures and characterization tests.** Use synthetic or
   anonymized data only — never user data.
4. **Remove hosted assumptions.** Strip user IDs, billing, database rows,
   auth, and scheduling from the design.
5. **Implement in the correct `owlie-cli` package.** Follow the dependency
   rules; keep provider-specific logic out of `@owlieio/core`.
6. **Add unit and contract tests.** Use `@owlieio/testing` fakes and
   contract-test helpers.
7. **Test a local package artifact or prerelease in `owlie-app`.** Link the
   package locally before any publish.
8. **Publish a stable version only after approval.** Publishing requires
   explicit repository-owner approval.
9. **Update `owlie-app` to the released `owlie` package.**
10. **Verify hosted parity.** Confirm identical observable behavior.
11. **Remove the private implementation only after parity is confirmed.**

## Never copy

- credentials or production environment files;
- user data;
- database code;
- billing logic;
- authentication code;
- analytics logic;
- deployment configuration;
- private fixtures.
