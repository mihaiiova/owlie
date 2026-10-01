import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Node version support', () => {
  const nvmrcMajor = read('.nvmrc').trim().split('.')[0];

  it('declares the .nvmrc Node major as the minimum in the published package', () => {
    const manifest = JSON.parse(read('apps/cli/package.json'));
    expect(manifest.engines?.node).toBe(`>=${nvmrcMajor}`);
  });

  it('keeps the workspace engines and build target on the same major', () => {
    const workspace = JSON.parse(read('package.json'));
    expect(workspace.engines.node).toBe(`>=${nvmrcMajor}.0.0`);
    expect(read('apps/cli/tsup.config.ts')).toContain(`target: 'node${nvmrcMajor}'`);
  });
});
