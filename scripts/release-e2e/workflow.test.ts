import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, 'utf8');

describe('release validation workflow (static)', () => {
  const workflow = read('.github/workflows/release-validate.yml');

  it('is a manually dispatched workflow with an expected_version input', () => {
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('expected_version');
  });

  it('protects the live job with the release environment', () => {
    expect(workflow).toContain('environment: release');
  });

  it('is validation-only: it must not publish or tag', () => {
    expect(workflow).not.toMatch(/npm publish/);
    expect(workflow).not.toMatch(/git tag/);
    expect(workflow).not.toMatch(/deploy-pages/);
  });

  it('packs once and shares one candidate artifact across jobs', () => {
    expect(workflow).toContain('upload-artifact');
    expect(workflow).toContain('download-artifact');
    expect(workflow).toContain('owlie-candidate');
  });

  it('runs offline smoke on Node 20 and 22', () => {
    expect(workflow).toContain("node: ['20', '22']");
  });

  it('runs the live suite exactly once', () => {
    expect(workflow).toContain('scripts/release-e2e.mjs');
    expect(workflow.match(/scripts\/release-e2e\.mjs/g)?.length).toBe(1);
  });
});

describe('pages deployment workflow (static)', () => {
  const pages = read('.github/workflows/pages.yml');

  it('deploys only the corpus directory', () => {
    expect(pages).toContain('path: e2e/corpus');
  });
});
