import type {
  Transcriber,
  TranscriptionInput,
  TranscriptionOptions,
  TranscriptionResult,
} from '@owlieio/core';

export class FakeTranscriber implements Transcriber {
  readonly id = 'fake-transcriber';

  async transcribe(
    input: TranscriptionInput,
    _options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    return {
      text: `transcript of ${input.mediaUrl ?? input.mediaPath ?? 'media'}`,
      language: 'en',
      metadata: { fake: true },
    };
  }
}
