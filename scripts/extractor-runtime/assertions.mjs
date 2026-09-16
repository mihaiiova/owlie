// Pure assertions for the packaged extractor-runtime verification. These
// validate the installed `owlie` executable's documented contract: doctor
// readiness, the direct-media `--json` transcript document, stdout/stderr
// separation (via the caller), prerequisite failure guidance, and the
// never-downloads-model-weights guarantee.

export const PREREQUISITE_GUIDANCE =
  /ensure ffprobe, ffmpeg, and python3 with faster-whisper are installed/;

export const MODEL_DOWNLOAD_GUIDANCE = /never downloads model weights/;

const FUNCTIONAL_ADAPTERS = ['youtube', 'podcast', 'rss', 'article'];
const FUNCTIONAL_PROVIDERS = ['deepseek', 'openai'];

/** Validates the shape and functional-content of an `owlie doctor --json` report. */
export function assertDoctorReport(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['doctor report is not an object'] };
  }
  if (typeof value.node !== 'string' || value.node.trim() === '') {
    errors.push('doctor report missing node version');
  }
  if (typeof value.platform !== 'string' || value.platform.trim() === '') {
    errors.push('doctor report missing platform');
  }
  if (typeof value.arch !== 'string' || value.arch.trim() === '') {
    errors.push('doctor report missing arch');
  }
  if (
    !Array.isArray(value.adapters) ||
    !FUNCTIONAL_ADAPTERS.every((id) => value.adapters.includes(id))
  ) {
    errors.push(`doctor report missing functional adapters: ${FUNCTIONAL_ADAPTERS.join(', ')}`);
  }
  if (
    !Array.isArray(value.providers) ||
    !FUNCTIONAL_PROVIDERS.every((id) => value.providers.some((p) => p && p.id === id))
  ) {
    errors.push(`doctor report missing functional providers: ${FUNCTIONAL_PROVIDERS.join(', ')}`);
  }
  if (!value.transcription || typeof value.transcription !== 'object') {
    errors.push('doctor report missing transcription readiness');
  } else {
    for (const field of ['whisper', 'ffmpeg', 'ffprobe', 'model']) {
      if (!(field in value.transcription)) {
        errors.push(`doctor transcription missing "${field}"`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Validates that every local transcription prerequisite was detected. */
export function assertTranscriptionDetected(transcription) {
  const errors = [];
  for (const field of ['whisper', 'ffmpeg', 'ffprobe']) {
    if (transcription?.[field] !== 'detected') {
      errors.push(`doctor transcription reports ${field} not detected`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Validates the normalized podcast transcript document emitted by `extract --json`. */
export function assertTranscriptDocument(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['extract output is not an object'] };
  }
  if (value.schemaVersion !== 1) {
    errors.push('extract document schemaVersion must be 1');
  }
  if (value.sourceType !== 'podcast') {
    errors.push(
      `extract document sourceType must be "podcast" (got ${JSON.stringify(value.sourceType)})`,
    );
  }
  if (value.mediaType !== 'transcript') {
    errors.push('extract document mediaType must be "transcript"');
  }
  if (typeof value.text !== 'string' || value.text.trim() === '') {
    errors.push('extract document text must be a non-empty string');
  }
  if (typeof value.canonicalUrl !== 'string' || !/^https?:\/\//.test(value.canonicalUrl)) {
    errors.push('extract document missing an http(s) canonicalUrl');
  }
  return { ok: errors.length === 0, errors };
}

/** Asserts stderr carries the missing-prerequisite installation guidance. */
export function assertPrerequisiteGuidance(stderr) {
  if (PREREQUISITE_GUIDANCE.test(String(stderr ?? ''))) return { ok: true, errors: [] };
  return { ok: false, errors: ['expected prerequisite installation guidance on stderr'] };
}

/** Asserts stderr carries the never-downloads-model-weights guidance. */
export function assertNoModelDownloadGuidance(stderr) {
  if (MODEL_DOWNLOAD_GUIDANCE.test(String(stderr ?? ''))) return { ok: true, errors: [] };
  return { ok: false, errors: ['expected "never downloads model weights" guidance on stderr'] };
}

/**
 * Asserts the real-runtime extraction cleared every prerequisite and the local
 * model load — i.e. its failure (if any) is not a missing prerequisite and not
 * a missing/unavailable model.
 */
export function assertRuntimePrerequisitesClear(stderr) {
  const text = String(stderr ?? '');
  const errors = [];
  if (PREREQUISITE_GUIDANCE.test(text)) {
    errors.push('stderr contains prerequisite installation guidance');
  }
  if (MODEL_DOWNLOAD_GUIDANCE.test(text)) {
    errors.push('stderr contains model-download guidance');
  }
  return { ok: errors.length === 0, errors };
}
