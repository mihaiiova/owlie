// Release E2E scenario definitions and orchestration. Scenario `run` closures
// spawn the installed bin; `assert` closures are pure. Orchestration
// (executeScenario) is injectable so the default suite tests it with canned
// results and no subprocess or network.

import { classifyFailure, MAX_ATTEMPTS, shouldRetry } from './classify.mjs';
import {
  assertContains,
  assertExitCode,
  assertMatch,
  assertNoSecrets,
  parseJson,
  parseJsonLines,
} from './assertions.mjs';
import { sanitize } from './redact.mjs';

const DIAGNOSTIC_LIMIT = 500;

/** Extracts the YouTube `v` parameter from a watch URL. */
export function youtubeVideoId(url) {
  const match = /[?&]v=([^&#]+)/.exec(String(url));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Converts a subprocess result and assertion errors into a classification input. */
export function toFailure(result, assertionErrors = []) {
  if (result.error) {
    return { kind: 'spawn', code: result.error.code, message: result.error.message };
  }
  if (result.signal) {
    return { kind: 'timeout', signal: result.signal };
  }
  if (result.status === 0) {
    return { kind: 'assertion', message: assertionErrors.join('; ') };
  }
  return { kind: 'exit', stderr: result.stderr, message: assertionErrors.join('; ') };
}

/** Renders bounded, shape-based diagnostics for a failed attempt. */
export function buildDiagnostics(result, assertionErrors = []) {
  const parts = [];
  if (assertionErrors.length > 0) parts.push(`assertions: ${assertionErrors.join('; ')}`);
  if (result.status !== null && result.status !== undefined && result.status !== 0) {
    parts.push(`exit ${result.status}`);
  }
  if (result.signal) parts.push(`signal ${result.signal}`);
  if (result.error) {
    parts.push(`spawn ${result.error.code ?? ''}: ${result.error.message ?? ''}`.trim());
  }
  const stderr = String(result.stderr ?? '').trim();
  if (stderr) parts.push(`stderr: ${stderr.slice(0, DIAGNOSTIC_LIMIT)}`);
  return parts.join(' | ');
}

/**
 * Runs one scenario with the retry/classification policy. `scenario.run` is
 * called with a boolean `useProxy` and returns a subprocess result; `scenario`
 * must also expose `assert` and `allowProxyFallback`.
 */
export function executeScenario({ scenario, ctx, secrets = [] }) {
  const started = Date.now();
  let attempts = 0;
  let useProxy = false;
  let lastDiagnostics = '';
  const attemptDiagnostics = [];
  const proxyConfigured = Boolean(ctx.proxyUrl);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const result = scenario.run(useProxy);
    const assertion = scenario.assert(result, ctx);
    if (result.status === 0 && assertion.ok) {
      return {
        name: scenario.name,
        status: 'passed',
        attempts,
        attemptDiagnostics,
        durationMs: Date.now() - started,
        diagnostics: '',
      };
    }

    const failure = toFailure(result, assertion.errors);
    const classification = classifyFailure(failure);
    lastDiagnostics = sanitize(buildDiagnostics(result, assertion.errors), { secrets });
    attemptDiagnostics.push({ attempt, classification, diagnostics: lastDiagnostics });
    const decision = shouldRetry({
      attempt,
      classification,
      proxyConfigured,
      allowProxyFallback: scenario.allowProxyFallback,
    });
    if (!decision.retry) {
      return {
        name: scenario.name,
        status: 'failed',
        attempts,
        attemptDiagnostics,
        durationMs: Date.now() - started,
        diagnostics: `${classification}: ${lastDiagnostics}`,
      };
    }
    useProxy = decision.useProxy;
  }

  return {
    name: scenario.name,
    status: 'failed',
    attempts,
    attemptDiagnostics,
    durationMs: Date.now() - started,
    diagnostics: lastDiagnostics,
  };
}

function jsonAssert(parse, extraChecks) {
  return (result) => {
    const exit = assertExitCode(result, 0);
    if (!exit.ok) return exit;
    const parsed = parse(result.stdout);
    if (!parsed.ok) return { ok: false, errors: [parsed.error] };
    const checks = extraChecks(parsed.value);
    if (checks.ok) return { ok: true, errors: [] };
    return { ok: false, errors: [checks.error] };
  };
}

/**
 * Builds the release scenario inventory. `spawn` is the primitive:
 * `spawn({ args, env, input, timeoutMs })` → `{ status, stdout, stderr, signal, error }`.
 */
export function buildScenarios(ctx, spawn) {
  const {
    articleUrl,
    feedUrl,
    youtubeUrl,
    apiKey,
    proxyUrl,
    configHome,
    proxyConfigHome,
    inputFile,
    corpus,
  } = ctx;
  const secrets = [apiKey, proxyUrl].filter(Boolean);

  const scenarios = [
    {
      name: 'help',
      allowProxyFallback: false,
      run: () => spawn({ args: ['--help'], env: {}, timeoutMs: 30_000 }),
      assert: (result) => {
        const errors = [];
        if (!assertExitCode(result, 0).ok) errors.push(assertExitCode(result, 0).error);
        if (!assertMatch(result.stdout, /extract|list|process|setup|doctor/i).ok)
          errors.push('help output missing functional commands');
        if (String(result.stderr) !== '') errors.push('help wrote to stderr');
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'version',
      allowProxyFallback: false,
      run: () => spawn({ args: ['--version'], env: {}, timeoutMs: 30_000 }),
      assert: (result) => {
        const errors = [];
        if (!assertExitCode(result, 0).ok) errors.push(assertExitCode(result, 0).error);
        if (!assertMatch(result.stdout, /^owlie \d+\.\d+\.\d+/).ok)
          errors.push('bad version output');
        if (String(result.stderr) !== '') errors.push('version wrote to stderr');
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'doctor',
      allowProxyFallback: false,
      run: () =>
        spawn({ args: ['doctor', '--json'], env: { DEEPSEEK_API_KEY: apiKey }, timeoutMs: 30_000 }),
      assert: (result) => {
        const errors = [];
        if (!assertExitCode(result, 0).ok) errors.push(assertExitCode(result, 0).error);
        const parsed = parseJson(result.stdout);
        if (!parsed.ok) errors.push(parsed.error);
        else {
          if (!parsed.value.adapters?.includes('youtube'))
            errors.push('doctor missing youtube adapter');
          if (!parsed.value.adapters?.includes('rss')) errors.push('doctor missing rss adapter');
          if (!parsed.value.adapters?.includes('article'))
            errors.push('doctor missing article adapter');
          if (!parsed.value.providers?.includes('deepseek'))
            errors.push('doctor missing deepseek provider');
        }
        if (!assertNoSecrets(result.stdout, secrets).ok) errors.push('doctor leaked a secret');
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'setup (proxy none)',
      allowProxyFallback: false,
      run: () =>
        spawn({
          args: ['setup'],
          env: { XDG_CONFIG_HOME: configHome },
          input: '2\n\n',
          timeoutMs: 30_000,
        }),
      assert: (result) => {
        const errors = [];
        if (!assertExitCode(result, 0).ok) errors.push(assertExitCode(result, 0).error);
        if (!assertContains(result.stdout, 'setup complete').ok)
          errors.push('setup did not complete');
        if (!assertNoSecrets(`${result.stdout}${result.stderr}`, secrets).ok)
          errors.push('setup leaked a secret');
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'list',
      allowProxyFallback: false,
      run: () =>
        spawn({ args: ['list', feedUrl, '--limit', '2', '--json'], env: {}, timeoutMs: 60_000 }),
      assert: jsonAssert(parseJson, (envelope) => {
        if (!Array.isArray(envelope.items) || envelope.items.length !== corpus.entryCount) {
          return {
            ok: false,
            error: `expected ${corpus.entryCount} items, got ${envelope.items?.length}`,
          };
        }
        if (envelope.items[0]?.canonicalUrl !== articleUrl) {
          return { ok: false, error: 'first item does not link the article' };
        }
        if (envelope.truncated !== false)
          return { ok: false, error: 'feed unexpectedly truncated' };
        return { ok: true };
      }),
    },
    {
      name: 'extract article',
      allowProxyFallback: false,
      run: () => spawn({ args: ['extract', articleUrl, '--json'], env: {}, timeoutMs: 60_000 }),
      assert: jsonAssert(parseJson, (doc) => {
        if (doc.sourceType !== 'article') return { ok: false, error: 'wrong sourceType' };
        if (doc.mediaType !== 'text') return { ok: false, error: 'wrong mediaType' };
        if (typeof doc.text !== 'string' || !doc.text.includes(corpus.marker)) {
          return { ok: false, error: 'article text missing marker' };
        }
        return { ok: true };
      }),
    },
    {
      name: 'extract youtube',
      allowProxyFallback: true,
      run: (useProxy) =>
        spawn({
          args: ['extract', youtubeUrl, '--json'],
          env: useProxy ? { XDG_CONFIG_HOME: proxyConfigHome } : { XDG_CONFIG_HOME: configHome },
          timeoutMs: 120_000,
        }),
      assert: jsonAssert(parseJson, (doc) => {
        if (doc.sourceType !== 'youtube') return { ok: false, error: 'wrong sourceType' };
        if (doc.mediaType !== 'transcript') return { ok: false, error: 'wrong mediaType' };
        if (typeof doc.text !== 'string' || doc.text.trim() === '') {
          return { ok: false, error: 'empty transcript' };
        }
        if (doc.metadata?.videoId !== youtubeVideoId(youtubeUrl)) {
          return { ok: false, error: 'video id mismatch' };
        }
        return { ok: true };
      }),
    },
    {
      name: 'extract feed',
      allowProxyFallback: false,
      run: () =>
        spawn({ args: ['extract', feedUrl, '--limit', '2', '--json'], env: {}, timeoutMs: 60_000 }),
      assert: jsonAssert(parseJson, (envelope) => {
        if (!Array.isArray(envelope.items) || envelope.items.length !== corpus.entryCount) {
          return { ok: false, error: `expected ${corpus.entryCount} items` };
        }
        const doc = envelope.items[0]?.document;
        if (doc?.sourceType !== 'article')
          return { ok: false, error: 'linked item not extracted as article' };
        if (typeof doc.text !== 'string' || !doc.text.includes(corpus.marker)) {
          return { ok: false, error: 'linked article text missing marker' };
        }
        if (envelope.truncated !== false)
          return { ok: false, error: 'feed unexpectedly truncated' };
        return { ok: true };
      }),
    },
    {
      name: 'process file',
      allowProxyFallback: false,
      run: () =>
        spawn({
          args: ['process', inputFile, '--prompt', 'Reply with exactly: OK', '--json'],
          env: { DEEPSEEK_API_KEY: apiKey },
          timeoutMs: 120_000,
        }),
      assert: jsonAssert(parseJson, (result) => {
        if (result.format !== 'text') return { ok: false, error: 'wrong result format' };
        if (!assertMatch(result.output, /OK/i).ok)
          return { ok: false, error: 'output missing OK marker' };
        if (!result.metadata?.model) return { ok: false, error: 'missing model metadata' };
        return { ok: true };
      }),
    },
    {
      name: 'extract → process pipeline',
      allowProxyFallback: false,
      run: () => {
        const extracted = spawn({ args: ['extract', articleUrl], env: {}, timeoutMs: 60_000 });
        if (extracted.status !== 0) return extracted;
        return spawn({
          args: ['process', '--prompt', 'Reply with exactly: OK', '--json'],
          env: { DEEPSEEK_API_KEY: apiKey },
          input: extracted.stdout,
          timeoutMs: 120_000,
        });
      },
      assert: jsonAssert(parseJson, (result) => {
        if (result.format !== 'text') return { ok: false, error: 'wrong result format' };
        if (!assertMatch(result.output, /OK/i).ok)
          return { ok: false, error: 'output missing OK marker' };
        return { ok: true };
      }),
    },
    {
      name: 'process feed --each',
      allowProxyFallback: false,
      run: () =>
        spawn({
          args: [
            'process',
            feedUrl,
            '--each',
            '--limit',
            '2',
            '--prompt',
            'Reply with exactly: OK',
          ],
          env: { DEEPSEEK_API_KEY: apiKey },
          timeoutMs: 120_000,
        }),
      assert: (result) => {
        if (!assertExitCode(result, 0).ok) return assertExitCode(result, 0);
        const parsed = parseJsonLines(result.stdout);
        if (!parsed.ok) return { ok: false, errors: [parsed.error] };
        if (parsed.records.length !== corpus.entryCount) {
          return {
            ok: false,
            errors: [`expected ${corpus.entryCount} records, got ${parsed.records.length}`],
          };
        }
        const record = parsed.records[0];
        if (record?.item?.url !== articleUrl)
          return { ok: false, errors: ['record item missing article url'] };
        if (record?.error) return { ok: false, errors: [`record failed: ${record.error.message}`] };
        if (!assertMatch(record?.result?.output, /OK/i).ok) {
          return { ok: false, errors: ['record output missing OK marker'] };
        }
        if (!assertNoSecrets(result.stdout, secrets).ok) {
          return { ok: false, errors: ['process output leaked a secret'] };
        }
        return { ok: true, errors: [] };
      },
    },
  ];

  return scenarios;
}
