// Failure classification and retry policy for the release E2E gate.
// Pure and side-effect-free; the default suite exercises it without network.

export const MAX_ATTEMPTS = 2;

const TRANSIENT_SPAWN_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
]);

// Deterministic markers take precedence over transient ones: a usage or auth
// failure must never be retried even if a transient marker also appears.
const DETERMINISTIC_PATTERNS = [
  /\b400\b/,
  /\b401\b/,
  /\b403\b/,
  /\b404\b/,
  /\binvalid\b/i,
  /\bunknown command\b/i,
  /\brequires a url\b/i,
  /\bapi key\b.*\bnot set\b/i,
  /\bis not set\b/i,
];

const TRANSIENT_PATTERNS = [
  /\b429\b/,
  /\b5\d\d\b/,
  /too many requests/i,
  /rate ?limit/i,
  /timed? ?out/i,
  /connection reset/i,
  /connection refused/i,
  /connection closed/i,
  /network is unreachable/i,
  /host is unreachable/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /\bETIMEDOUT\b/,
  /\bECONNRESET\b/,
  /\bECONNREFUSED\b/,
  /\bEAI_AGAIN\b/,
];

/** Detects the YouTube runner-IP block diagnostic emitted by the adapter. */
export function isYoutubeAccessBlock(text) {
  return /YouTube blocked the transcript request/i.test(text);
}

/**
 * Classifies why a scenario attempt failed.
 *
 * @returns {'transient' | 'youtube-access-block' | 'deterministic'}
 */
export function classifyFailure(failure) {
  if (failure.kind === 'timeout') return 'transient';

  if (failure.kind === 'spawn') {
    return TRANSIENT_SPAWN_CODES.has(failure.code) ? 'transient' : 'deterministic';
  }

  if (failure.kind === 'exit') {
    const text = `${failure.stderr ?? ''} ${failure.message ?? ''}`;
    if (isYoutubeAccessBlock(text)) return 'youtube-access-block';
    if (DETERMINISTIC_PATTERNS.some((re) => re.test(text))) return 'deterministic';
    if (TRANSIENT_PATTERNS.some((re) => re.test(text))) return 'transient';
    return 'deterministic';
  }

  return 'deterministic';
}

/**
 * Decides whether a failed attempt (1-based) may be retried, and whether the
 * retry should switch to the configured proxy fallback. Only a YouTube access
 * block ever uses the proxy; transient failures retry with the same config.
 */
export function shouldRetry({ attempt, classification, proxyConfigured, allowProxyFallback }) {
  if (attempt < 1 || attempt >= MAX_ATTEMPTS) return { retry: false, useProxy: false };
  if (classification === 'transient') return { retry: true, useProxy: false };
  if (classification === 'youtube-access-block' && allowProxyFallback && proxyConfigured) {
    return { retry: true, useProxy: true };
  }
  return { retry: false, useProxy: false };
}
