// CLI smoke tests. Run after `pnpm build`.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = join(root, 'apps/cli/dist/bin.js');

function run(args) {
  const res = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const checks = [
  {
    name: '--help',
    args: ['--help'],
    status: 0,
    stdout: /list|extract|search|process|config|doctor/i,
    stderr: null,
  },
  {
    name: '--version',
    args: ['--version'],
    status: 0,
    stdout: /owlie\s+\d+\.\d+\.\d+/,
    stderr: null,
  },
  {
    name: 'doctor',
    args: ['doctor'],
    status: 0,
    stdout: /node/i,
    stderr: null,
  },
  {
    name: 'list is not implemented',
    args: ['list', 'https://example.com'],
    status: 3,
    stdout: null,
    stderr: /not implemented/i,
  },
  {
    name: 'unknown command',
    args: ['frobnicate'],
    status: 2,
    stdout: null,
    stderr: /unknown command/i,
  },
];

let failed = false;
for (const check of checks) {
  const r = run(check.args);
  const statusOk = r.status === check.status;
  const stdoutOk = check.stdout ? check.stdout.test(r.stdout) : true;
  const stderrOk = check.stderr ? check.stderr.test(r.stderr) : true;
  if (statusOk && stdoutOk && stderrOk) {
    console.log(`ok  ${check.name}`);
  } else {
    failed = true;
    console.error(
      `FAIL ${check.name}: status=${r.status} (want ${check.status}) stdout=${JSON.stringify(
        r.stdout,
      )} stderr=${JSON.stringify(r.stderr)}`,
    );
  }
}

if (failed) {
  process.exit(1);
}
console.log('CLI smoke tests passed.');
