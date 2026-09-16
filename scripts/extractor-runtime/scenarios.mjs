// Scenario definitions for the packaged extractor-runtime verification. Each
// scenario's `run` closure spawns the installed `owlie` bin; its `assert`
// closure is pure and unit-tested here. The `runtime` field (shims mode)
// selects which shim set the runner places on PATH.

import { assertExitCode, parseJson } from '../release-e2e/assertions.mjs';
import {
  assertDoctorReport,
  assertNoModelDownloadGuidance,
  assertPrerequisiteGuidance,
  assertRuntimePrerequisitesClear,
  assertTranscriptionDetected,
  assertTranscriptDocument,
} from './assertions.mjs';

function transcriptDocumentErrors(value, stderr) {
  const errors = [];
  const doc = assertTranscriptDocument(value);
  if (!doc.ok) errors.push(...doc.errors);
  else if (String(stderr ?? '').includes(value.text)) {
    errors.push('extract transcript text leaked to stderr');
  }
  return errors;
}

/** Offline-safe shim-runtime scenarios for ordinary CI and local runs. */
export function buildShimScenarios({ mediaUrl }) {
  return [
    {
      name: 'doctor --json (shimmed runtime)',
      runtime: 'healthy',
      run: (spawn) => spawn({ args: ['doctor', '--json'] }),
      assert: (result) => {
        const errors = [];
        const exit = assertExitCode(result, 0);
        if (!exit.ok) errors.push(exit.error);
        const parsed = parseJson(result.stdout);
        if (!parsed.ok) errors.push(parsed.error);
        else {
          errors.push(...assertDoctorReport(parsed.value).errors);
          errors.push(...assertTranscriptionDetected(parsed.value.transcription).errors);
        }
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'extract direct-media --json (shimmed runtime)',
      runtime: 'healthy',
      run: (spawn) => spawn({ args: ['extract', mediaUrl, '--json'] }),
      assert: (result) => {
        const errors = [];
        const exit = assertExitCode(result, 0);
        if (!exit.ok) errors.push(exit.error);
        const parsed = parseJson(result.stdout);
        if (!parsed.ok) errors.push(parsed.error);
        else errors.push(...transcriptDocumentErrors(parsed.value, result.stderr));
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'extract missing ffprobe -> prerequisite guidance',
      runtime: 'no-ffprobe',
      run: (spawn) => spawn({ args: ['extract', mediaUrl, '--json'] }),
      assert: (result) => {
        const errors = [];
        const exit = assertExitCode(result, 1);
        if (!exit.ok) errors.push(exit.error);
        errors.push(...assertPrerequisiteGuidance(result.stderr).errors);
        if (String(result.stdout ?? '').trim() !== '') errors.push('failure wrote to stdout');
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'extract missing model -> never downloads guidance',
      runtime: 'missing-model',
      run: (spawn) => spawn({ args: ['extract', mediaUrl, '--json'] }),
      assert: (result) => {
        const errors = [];
        const exit = assertExitCode(result, 1);
        if (!exit.ok) errors.push(exit.error);
        errors.push(...assertNoModelDownloadGuidance(result.stderr).errors);
        if (String(result.stdout ?? '').trim() !== '') errors.push('failure wrote to stdout');
        return { ok: errors.length === 0, errors };
      },
    },
  ];
}

/**
 * Gated real-runtime scenarios (Python + faster-whisper + ffmpeg + ffprobe and
 * a pre-provisioned model). These never run in the default suite.
 */
export function buildRealScenarios({ mediaUrl }) {
  return [
    {
      name: 'doctor --json (real runtime)',
      run: (spawn) => spawn({ args: ['doctor', '--json'] }),
      assert: (result) => {
        const errors = [];
        const exit = assertExitCode(result, 0);
        if (!exit.ok) errors.push(exit.error);
        const parsed = parseJson(result.stdout);
        if (!parsed.ok) errors.push(parsed.error);
        else {
          errors.push(...assertDoctorReport(parsed.value).errors);
          errors.push(...assertTranscriptionDetected(parsed.value.transcription).errors);
          if (parsed.value.transcription?.model !== 'set') {
            errors.push('doctor transcription model must be set (pre-provisioned)');
          }
        }
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'extract direct-media --json (real runtime)',
      run: (spawn) => spawn({ args: ['extract', mediaUrl, '--json'] }),
      assert: (result) => {
        const errors = [];
        if (result.status === 0) {
          const parsed = parseJson(result.stdout);
          if (!parsed.ok) errors.push(parsed.error);
          else errors.push(...transcriptDocumentErrors(parsed.value, result.stderr));
        } else if (result.status === 1) {
          // A real runtime that cleared prerequisites and loaded the local model
          // may still fail with an empty transcript on the synthetic fixture.
          errors.push(...assertRuntimePrerequisitesClear(result.stderr).errors);
        } else {
          errors.push(`unexpected exit code ${result.status}`);
        }
        return { ok: errors.length === 0, errors };
      },
    },
  ];
}
