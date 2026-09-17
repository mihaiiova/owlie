import type { ModelInfo, ProviderCatalog } from '@owlieio/core';

/** An in-memory provider catalog for tests and contract checks. */
export class FakeProviderCatalog implements ProviderCatalog {
  readonly providerId = 'fake-provider';

  async listModels(): Promise<ModelInfo[]> {
    return [
      { provider: this.providerId, id: 'fake-model-a' },
      { provider: this.providerId, id: 'fake-model-b', capabilities: { tools: true } },
    ];
  }
}
