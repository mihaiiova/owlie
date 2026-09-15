export {
  DEFAULT_CHUNK_OVERLAP_SECONDS,
  DEFAULT_CHUNK_SECONDS,
  DEFAULT_WHISPER_COMPUTE_TYPE,
  DEFAULT_WHISPER_LANGUAGE,
  DEFAULT_WHISPER_MODEL,
  WhisperLocalTranscriber,
  computeChunkRanges,
  mergeChunkTranscripts,
} from './whisper.js';
export type {
  ChunkRange,
  ChunkTranscript,
  SubprocessRunner,
  WhisperDevice,
  WhisperLocalConfig,
} from './whisper.js';
