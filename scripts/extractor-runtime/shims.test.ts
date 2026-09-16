import { describe, expect, it } from 'vitest';

import { buildShims } from './shims.mjs';

const BEHAVIOR_PATH = '/repo/scripts/extractor-runtime/runtime-behavior.cjs';
const NODE_PATH = '/usr/bin/node';

describe('buildShims', () => {
  it('builds the three healthy shims by default', () => {
    const shims = buildShims({ behaviorPath: BEHAVIOR_PATH, nodePath: NODE_PATH });
    expect(Object.keys(shims)).toEqual(['python3', 'ffprobe', 'ffmpeg']);
    for (const script of Object.values(shims)) {
      expect(script).toContain('#!');
      expect(script).toContain(NODE_PATH);
      expect(script).toContain(BEHAVIOR_PATH);
    }
    expect(shims.python3).toContain('python3(process.argv.slice(2), "healthy")');
    expect(shims.ffprobe).toContain('ffprobe()');
    expect(shims.ffmpeg).toContain('ffmpeg()');
  });

  it('omits an absent shim', () => {
    const shims = buildShims({
      ffprobe: 'absent',
      behaviorPath: BEHAVIOR_PATH,
      nodePath: NODE_PATH,
    });
    expect(shims.ffprobe).toBeNull();
    expect(shims.python3).not.toBeNull();
    expect(shims.ffmpeg).not.toBeNull();
  });

  it('configures the missing-model python shim', () => {
    const shims = buildShims({
      python: 'missing-model',
      behaviorPath: BEHAVIOR_PATH,
      nodePath: NODE_PATH,
    });
    expect(shims.python3).toContain('python3(process.argv.slice(2), "missing-model")');
  });

  it('is deterministic', () => {
    expect(buildShims({ behaviorPath: BEHAVIOR_PATH, nodePath: NODE_PATH })).toEqual(
      buildShims({ behaviorPath: BEHAVIOR_PATH, nodePath: NODE_PATH }),
    );
  });
});
