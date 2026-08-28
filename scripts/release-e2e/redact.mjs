// Secret redaction for release E2E diagnostics and reports. Pure.

const SECRET_PLACEHOLDER = '[REDACTED]';

/** Replaces every occurrence of each configured secret with a placeholder. */
export function redact(text, secrets = []) {
  let out = String(text);
  for (const secret of secrets) {
    if (secret) out = out.split(String(secret)).join(SECRET_PLACEHOLDER);
  }
  return out;
}

/**
 * Removes authorization-like data by shape: `Authorization: ...` headers,
 * bearer tokens, `DEEPSEEK_API_KEY=...` assignments, and standalone `sk-`
 * tokens. The exact secret list handles values that do not match these shapes.
 */
export function redactAuthorization(text) {
  return String(text)
    .replace(/(Authorization\s*:\s*)(?:Bearer\s+|Basic\s+)?([^\s,;"']+)/gi, '$1[REDACTED]')
    .replace(/\b(Bearer|Basic)\s+[^\s,;"']+/gi, '$1 [REDACTED]')
    .replace(/\bDEEPSEEK_API_KEY=\S+/gi, 'DEEPSEEK_API_KEY=[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, SECRET_PLACEHOLDER);
}

/** Applies exact-secret redaction followed by shape-based redaction. */
export function sanitize(text, { secrets = [] } = {}) {
  return redactAuthorization(redact(text, secrets));
}
