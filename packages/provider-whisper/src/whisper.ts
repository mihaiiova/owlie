import type {
  Transcriber,
  TranscriptionInput,
  TranscriptionOptions,
  TranscriptionResult,
} from '@owlieio/core';
import { NotImplementedError } from '@owlieio/core';

export type WhisperDevice = 'cpu' | 'cuda' | 'auto';

export interface WhisperLocalConfig {
  model?: string;
  language?: string;
  computeType?: string;
  device?: WhisperDevice;
  ffmpegPath?: string;
  ffprobePath?: string;
  pythonPath?: string;
}

export const DEFAULT_WHISPER_MODEL = 'small';
export const DEFAULT_WHISPER_LANGUAGE = 'auto';
export const DEFAULT_WHISPER_COMPUTE_TYPE = 'int8';

/**
 * Local faster-whisper transcriber. This scaffold defines the surface and
 * config but never invokes faster-whisper; `transcribe` throws
 * {@link NotImplementedError}.
 */
export class WhisperLocalTranscriber implements Transcriber {
  static readonly id = 'whisper-local';
  readonly id = WhisperLocalTranscriber.id;
  readonly config: WhisperLocalConfig;

  constructor(config: WhisperLocalConfig = {}) {
    this.config = config;
  }

  async transcribe(
    _input: TranscriptionInput,
    _options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    throw new NotImplementedError('local faster-whisper transcription is not implemented yet');
  }
}
