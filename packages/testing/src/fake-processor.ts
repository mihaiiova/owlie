import type {
  ContentProcessor,
  ProcessRequest,
  ProcessResult,
  ProcessorOptions,
} from '@owlieio/core';

export class FakeContentProcessor implements ContentProcessor {
  readonly id = 'fake-processor';

  async process(request: ProcessRequest, _options?: ProcessorOptions): Promise<ProcessResult> {
    return {
      output: JSON.stringify({
        processed: request.document.id,
        instruction: request.instruction ?? null,
      }),
      format: 'json',
      metadata: { fake: true },
    };
  }
}
