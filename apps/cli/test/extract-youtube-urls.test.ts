import { describe, expect, it } from 'vitest';
import type { ItemAdapter } from '@owlieio/core';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

const VIDEO_ID = 'dQw4w9WgXcQ';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: false, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

/** Fails the test if dispatch ever reaches a later adapter. */
function unreachable(id: string, sourceType: ItemAdapter['sourceType']): ItemAdapter {
  return {
    id,
    sourceType,
    recognize: () => true,
    async resolveItem() {
      throw new Error(`${id} must not be reached`);
    },
    async extract() {
      throw new Error(`${id} must not be reached`);
    },
  };
}

describe('extract — unsupported YouTube URL forms', () => {
  it.each([
    ['a live stream', `https://www.youtube.com/live/${VIDEO_ID}`, 'live streams are not supported'],
    ['a Short', `https://www.youtube.com/shorts/${VIDEO_ID}`, 'Shorts are not supported'],
  ])('rejects %s with VALIDATION_ERROR and no fallback', async (_label, url, message) => {
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', url, '--json'], io, {
      extract: {
        itemAdapters: [
          new YouTubeAdapter(),
          unreachable('podcast', 'podcast'),
          unreachable('article', 'article'),
        ],
      },
    });

    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    const record = JSON.parse(stderr().trim().split('\n').at(-1)!);
    expect(record).toMatchObject({ kind: 'error', code: 'VALIDATION_ERROR' });
    expect(record.message).toContain(message);
    expect(stderr()).not.toContain('ARTICLE_FALLBACK');
    expect(stderr()).not.toContain('must not be reached');
  });
});
