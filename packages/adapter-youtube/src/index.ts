export {
  YouTubeAdapter,
  canonicalizeVideoUrl,
  extractVideoId,
  isPlaylistUrl,
  isVideoUrl,
  recognizeYouTubeUrl,
} from './youtube.js';
export {
  DEFAULT_LANGUAGES,
  DEFAULT_TIMEOUT_MS,
  LibraryTranscriptSource,
  YouTubeTranscriptClient,
  pickTranscript,
  toProxyConfig,
  transcriptApiOptions,
} from './transcript.js';
export type {
  FetchedTrack,
  TranscriptClient,
  TranscriptPayload,
  TranscriptProxy,
  TranscriptSource,
  TranscriptTrack,
  YouTubeAdapterOptions,
} from './transcript.js';
