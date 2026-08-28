// Candidate manifest and sanitized scenario report generation. Pure.

import { sanitize } from './redact.mjs';

const MANIFEST_FIELDS = [
  ['packageName', 'packageName'],
  ['version', 'version'],
  ['commitSha', 'commitSha'],
  ['tarball', 'tarball'],
  ['sha256', 'sha256'],
];

/** Builds the machine-readable release candidate manifest. */
export function buildCandidateManifest(input) {
  const errors = [];
  const manifest = {};
  for (const [key, label] of MANIFEST_FIELDS) {
    const value = input[key];
    if (!value) errors.push(`missing required candidate field: ${label}`);
    else manifest[key] = value;
  }
  return {
    ok: errors.length === 0,
    errors,
    manifest: errors.length === 0 ? manifest : null,
  };
}

/**
 * Builds a sanitized report from candidate identity and scenario results.
 * Diagnostics are redacted against the configured secrets; the returned report
 * never contains those values.
 */
export function buildReport({ candidate, scenarios, secrets = [] }) {
  const sanitizedScenarios = scenarios.map((scenario) => ({
    ...scenario,
    diagnostics: sanitize(scenario.diagnostics ?? '', { secrets }),
    attemptDiagnostics: (scenario.attemptDiagnostics ?? []).map((entry) => ({
      ...entry,
      diagnostics: sanitize(entry.diagnostics ?? '', { secrets }),
    })),
  }));

  const summary = sanitizedScenarios.reduce(
    (acc, scenario) => {
      acc.total += 1;
      if (scenario.status === 'passed') acc.passed += 1;
      else if (scenario.status === 'failed') acc.failed += 1;
      else if (scenario.status === 'skipped') acc.skipped += 1;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, skipped: 0 },
  );

  return { candidate, summary, scenarios: sanitizedScenarios };
}

/** Renders a concise human-readable summary of a sanitized report. */
export function buildSummary(report) {
  const { candidate, summary, scenarios } = report;
  const lines = [
    `Release E2E: ${candidate.packageName} ${candidate.version} @ ${candidate.commitSha}`,
    `Result: ${summary.passed}/${summary.total} passed (${summary.failed} failed, ${summary.skipped} skipped)`,
  ];
  for (const scenario of scenarios) {
    if (scenario.status === 'failed') {
      lines.push(
        `- FAIL ${scenario.name} (${scenario.attempts} attempt(s)): ${scenario.diagnostics}`,
      );
      for (const attempt of scenario.attemptDiagnostics ?? []) {
        lines.push(
          `    attempt ${attempt.attempt} [${attempt.classification}]: ${attempt.diagnostics}`,
        );
      }
    }
  }
  return lines.join('\n');
}
