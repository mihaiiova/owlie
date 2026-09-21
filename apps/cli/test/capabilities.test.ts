import { describe, expect, it } from 'vitest';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

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

describe('capabilities command', () => {
  it('reports a versioned protocol envelope of the artifact manifest', async () => {
    const { io, stdout } = capture();
    const code = await run(['capabilities', '--json'], io, {});
    expect(code).toBe(ExitCode.Success);

    const envelope = JSON.parse(stdout());
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.command).toBe('capabilities');

    const report = envelope.result;
    expect(report.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(report.protocolSchemaVersion).toBe(1);
    expect(report.documentSchemaVersion).toBe(2);
    expect(report.commands).toContain('extract');
    expect(report.commands).toContain('capabilities');
    expect(report.adapters).toEqual(
      expect.arrayContaining(['youtube', 'podcast', 'rss', 'article']),
    );
    expect(report.providers).toEqual(expect.arrayContaining(['deepseek', 'openai']));
    expect(report.resolvers).toEqual(
      expect.arrayContaining(['podcast-media', 'podcast-apple', 'podcast-page']),
    );
  });

  it('is configuration- and credential-independent (no env, no config read)', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['capabilities', '--json', '--hosted'], io, {});
    expect(code).toBe(ExitCode.Success);
    expect(stderr()).toBe('');
    expect(JSON.parse(stdout()).command).toBe('capabilities');
  });

  it('prints concise human-readable text without --json', async () => {
    const { io, stdout } = capture();
    const code = await run(['capabilities'], io, {});
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('owlie');
    expect(stdout()).toContain('Commands:');
    expect(stdout()).toContain('Adapters:');
  });
});

describe('--version --json', () => {
  it('emits the versioned result envelope as a scalar version response', async () => {
    const { io, stdout } = capture();
    const code = await run(['--version', '--json'], io, {});
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.command).toBe('version');
    expect(envelope.result).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('preserves the existing plain --version output', async () => {
    const { io, stdout } = capture();
    const code = await run(['--version'], io, {});
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toMatch(/^owlie \d+\.\d+\.\d+\n$/);
  });
});
