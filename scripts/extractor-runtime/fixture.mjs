import { Buffer } from 'node:buffer';

// Deterministic audio fixture generation for the extractor-runtime
// verification. The generated WAV is a valid PCM16 mono sine wave, small
// enough to commit to the controlled corpus but structurally a real audio file
// that ffprobe/ffmpeg/faster-whisper accept.

export const WAV_HEADER_BYTES = 44;

const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac'];

/**
 * Extracts and validates the controlled-corpus audio entry from the manifest.
 * Pure; keeps the fixture's allowlisted-extension and path contract near the
 * code that depends on it.
 *
 * @param {string} manifestJson
 * @returns {{ ok: boolean, errors: string[], entry: { path: string, contentType?: string } | null }}
 */
export function audioEntryFromManifest(manifestJson) {
  let manifest;
  try {
    manifest = JSON.parse(String(manifestJson ?? ''));
  } catch (error) {
    return {
      ok: false,
      errors: [
        `corpus manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
      entry: null,
    };
  }
  const audio = manifest?.audio;
  const errors = [];
  if (!audio || typeof audio !== 'object') {
    errors.push('corpus manifest is missing an audio entry');
  }
  const path = typeof audio?.path === 'string' ? audio.path : '';
  if (path === '') {
    errors.push('corpus audio path is missing or empty');
  } else if (!ALLOWED_AUDIO_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))) {
    errors.push(
      `corpus audio path must use an allowlisted audio extension (${ALLOWED_AUDIO_EXTENSIONS.join(', ')})`,
    );
  }
  if (errors.length > 0) return { ok: false, errors, entry: null };
  return {
    ok: true,
    errors: [],
    entry: {
      path,
      contentType: typeof audio.contentType === 'string' ? audio.contentType : undefined,
    },
  };
}

/**
 * Builds a valid PCM16 mono WAV (RIFF) buffer with a quiet sine tone.
 *
 * @param {{ seconds?: number, sampleRate?: number, frequency?: number }} [options]
 * @returns {Buffer}
 */
export function buildWavFixture({ seconds = 1, sampleRate = 16000, frequency = 440 } = {}) {
  const sampleCount = Math.max(1, Math.round(seconds * sampleRate));
  const dataSize = sampleCount * 2; // 16-bit mono
  const buffer = Buffer.alloc(WAV_HEADER_BYTES + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * t) * 0.25 * 32767);
    buffer.writeInt16LE(sample, WAV_HEADER_BYTES + i * 2);
  }
  return buffer;
}
