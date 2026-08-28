// Pure scenario-result assertions for the release E2E gate.

/** Parses a single JSON document from text. */
export function parseJson(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') {
    return { ok: false, value: undefined, error: 'empty output (expected JSON)' };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed), error: undefined };
  } catch (error) {
    return {
      ok: false,
      value: undefined,
      error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Parses a JSONL stream. Blank lines are ignored; each non-blank line must be
 * valid JSON. Empty input yields an empty record list (the caller decides
 * whether a non-empty stream is required).
 */
export function parseJsonLines(text) {
  const lines = String(text ?? '').split('\n');
  const records = [];
  let lineNumber = 0;
  for (const raw of lines) {
    lineNumber += 1;
    const line = raw.trim();
    if (line === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      return {
        ok: false,
        records: [],
        error: `invalid JSON on line ${lineNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
  return { ok: true, records, error: undefined };
}

/** Asserts a subprocess result exited with the expected status. */
export function assertExitCode(result, expected) {
  const status = result.status;
  if (status === expected) return { ok: true, error: undefined };
  return { ok: false, error: `expected exit code ${expected}, got ${status ?? '<none>'}` };
}

/** Asserts the given text contains the expected substring. */
export function assertContains(text, expected) {
  if (String(text).includes(expected)) return { ok: true, error: undefined };
  return { ok: false, error: `expected output to contain ${JSON.stringify(expected)}` };
}

/** Asserts the given text matches a string or RegExp pattern. */
export function assertMatch(text, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  if (re.test(String(text))) return { ok: true, error: undefined };
  return { ok: false, error: `expected output to match ${String(pattern)}` };
}

/** Asserts no configured secret value appears in the text. */
export function assertNoSecrets(text, secrets = []) {
  const haystack = String(text);
  for (const secret of secrets) {
    if (secret && haystack.includes(String(secret))) {
      return { ok: false, error: 'output contains a configured secret' };
    }
  }
  return { ok: true, error: undefined };
}
