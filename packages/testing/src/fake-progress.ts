import type { ProgressEvent, ProgressSink } from '@owlieio/core';

/** Records progress events for assertions in tests. */
export class FakeProgressSink implements ProgressSink {
  readonly events: ProgressEvent[] = [];

  emit(event: ProgressEvent): void {
    this.events.push(event);
  }
}
