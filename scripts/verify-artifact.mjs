// Verifies the published `owlie` tarball: packs it, checks its contents,
// installs it into a clean directory, and runs the offline-safe release
// acceptance commands against the installed binary. Requires network access
// (to install the runtime dependencies). Run with: pnpm verify:artifact
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cliDir = join(root, 'apps/cli');
const pkg = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8'));

const failures = [];
const ok = (name) => console.log(`ok  ${name}`);
const fail = (name) => {
  failures.push(name);
  console.error(`FAIL ${name}`);
};
const check = (cond, name) => (cond ? ok(name) : fail(name));

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const packDir = mkdtempSync(join(tmpdir(), 'owlie-pack-'));
const installDir = mkdtempSync(join(tmpdir(), 'owlie-install-'));
let tarball;

try {
  // 1. Pack the published package.
  const packed = run('npm', ['pack', '--pack-destination', packDir, '--silent'], { cwd: cliDir });
  check(packed.status === 0, 'npm pack succeeds');
  tarball = join(packDir, `${pkg.name}-${pkg.version}.tgz`);
  check(existsSync(tarball), `tarball created (${tarball})`);

  // 2. Inspect the tarball contents.
  const listed = run('tar', ['-tzf', tarball]);
  const contents = listed.stdout;
  check(contents.includes('package/dist/bin.js'), 'tarball contains dist/bin.js');
  check(contents.includes('package/package.json'), 'tarball contains package.json');
  check(!contents.includes('.env'), 'tarball contains no .env file');

  // 3. Clean install into a fresh directory.
  writeFileSync(
    join(installDir, 'package.json'),
    JSON.stringify({ name: 'artifact-test', private: true, version: '1.0.0' }),
    'utf8',
  );
  const installed = run('npm', ['install', '--no-audit', '--no-fund', tarball], {
    cwd: installDir,
  });
  check(installed.status === 0, 'npm install of the tarball succeeds');
  const bin = join(installDir, 'node_modules', '.bin', 'owlie');
  check(existsSync(bin), 'owlie bin shim is installed');

  // 4. Run the offline-safe release acceptance commands.
  const acceptance = [
    { name: '--version', args: ['--version'], status: 0, stdout: /^owlie \d+\.\d+\.\d+/m },
    { name: '--help', args: ['--help'], status: 0, stdout: /extract|process|doctor/i },
    { name: 'doctor', args: ['doctor'], status: 0, stdout: /node/i },
    {
      name: 'extract rejects an invalid URL',
      args: ['extract', 'not-a-url'],
      status: 1,
      stderr: /invalid URL/i,
    },
    {
      name: 'process with empty stdin errors',
      args: ['process', '--prompt', 'Summarize this'],
      status: 1,
      stderr: /stdin is empty/i,
    },
  ];
  for (const item of acceptance) {
    const r = run(process.execPath, [bin, ...item.args]);
    const statusOk = r.status === item.status;
    const stdoutOk = item.stdout ? item.stdout.test(r.stdout) : true;
    const stderrOk = item.stderr ? item.stderr.test(r.stderr) : true;
    check(statusOk && stdoutOk && stderrOk, `${item.name} (status=${r.status})`);
  }
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(installDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('Artifact verification failures:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Artifact verification passed.');
