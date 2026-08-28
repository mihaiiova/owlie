// Candidate identity and version validation for the release E2E gate.
// Pure and side-effect-free so the default suite can test it without network
// or credentials.

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Parses a semantic version. Returns structured fields or null when the input
 * is not valid semver (no leading `v`, no surrounding whitespace).
 */
export function parseSemver(value) {
  const match = SEMVER_RE.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
    build: match[5] ?? null,
  };
}

/**
 * Validates that the dispatch `expected_version` matches the packaged `owlie`
 * version. Returns a list of human-readable errors rather than throwing, so
 * the workflow can report every precondition failure before spending money on
 * live provider calls.
 */
export function validateCandidate({ expectedVersion, packageVersion }) {
  const errors = [];
  const expected = String(expectedVersion ?? '').trim();
  const actual = String(packageVersion ?? '').trim();

  if (parseSemver(expected) === null) {
    errors.push(`expected version "${expected}" is not a valid semantic version`);
  }
  if (parseSemver(actual) === null) {
    errors.push(`package version "${actual || '<empty>'}" is not a valid semantic version`);
  }
  if (errors.length === 0 && expected !== actual) {
    errors.push(`expected version "${expected}" does not match package version "${actual}"`);
  }

  return { ok: errors.length === 0, errors };
}

/** Accepts both `main` (github.ref_name) and `refs/heads/main` (github.ref). */
export function isMainRef(ref) {
  return ref === 'main' || ref === 'refs/heads/main';
}
