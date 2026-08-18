import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import type { CliIo } from '../io.js';
import { ExitCode } from '../io.js';
import type { CliOptions } from '../cli.js';
import { cacheDir, configDir } from '../config.js';
import { ADAPTER_IDS, PROVIDER_IDS } from '../registry.js';

/** Injectable system probes so tests can run `doctor` without spawning. */
export interface DoctorDeps {
  commandAvailable(command: string, args: string[]): Promise<boolean>;
  dirWritable(dir: string): Promise<boolean>;
}

export const defaultDoctorDeps: DoctorDeps = {
  commandAvailable(command, args) {
    return new Promise((resolve) => {
      execFile(command, args, { timeout: 5000 }, (error) => resolve(error === null));
    });
  },
  async dirWritable(dir) {
    try {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
};

// Presence only — values are never read, printed, or logged.
const PROVIDER_ENV_VARS = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'];

export interface DoctorReport {
  node: string;
  platform: string;
  arch: string;
  ffmpeg: 'available' | 'missing';
  ffprobe: 'available' | 'missing';
  python: 'available' | 'missing';
  providerEnvironmentVariables: { name: string; set: boolean }[];
  adapters: string[];
  providers: string[];
  configDirectory: { path: string; writable: boolean };
  cacheDirectory: { path: string; writable: boolean };
}

async function collectDoctorReport(deps: DoctorDeps): Promise<DoctorReport> {
  const [ffmpeg, ffprobe, python3, python, configWritable, cacheWritable] = await Promise.all([
    deps.commandAvailable('ffmpeg', ['-version']),
    deps.commandAvailable('ffprobe', ['-version']),
    deps.commandAvailable('python3', ['--version']),
    deps.commandAvailable('python', ['--version']),
    deps.dirWritable(configDir()),
    deps.dirWritable(cacheDir()),
  ]);

  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    ffmpeg: ffmpeg ? 'available' : 'missing',
    ffprobe: ffprobe ? 'available' : 'missing',
    python: python3 || python ? 'available' : 'missing',
    providerEnvironmentVariables: PROVIDER_ENV_VARS.map((name) => ({
      name,
      set: Boolean(process.env[name]),
    })),
    adapters: [...ADAPTER_IDS],
    providers: [...PROVIDER_IDS],
    configDirectory: { path: configDir(), writable: configWritable },
    cacheDirectory: { path: cacheDir(), writable: cacheWritable },
  };
}

function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    'owlie doctor',
    `  Node: ${report.node}`,
    `  Platform: ${report.platform} (${report.arch})`,
    `  ffmpeg: ${report.ffmpeg}`,
    `  ffprobe: ${report.ffprobe}`,
    `  Python: ${report.python}`,
    '  Provider environment variables:',
  ];
  for (const variable of report.providerEnvironmentVariables) {
    lines.push(`    ${variable.name}: ${variable.set ? 'set' : 'not set'}`);
  }
  lines.push(
    `  Adapters: ${report.adapters.join(', ')}`,
    `  Providers: ${report.providers.join(', ')}`,
  );
  lines.push(
    `  Config directory: ${report.configDirectory.path} (${report.configDirectory.writable ? 'writable' : 'not writable'})`,
    `  Cache directory: ${report.cacheDirectory.path} (${report.cacheDirectory.writable ? 'writable' : 'not writable'})`,
  );
  return lines.join('\n') + '\n';
}

export async function runDoctorCommand(
  io: CliIo,
  options: CliOptions,
  deps?: DoctorDeps,
): Promise<number> {
  const report = await collectDoctorReport(deps ?? defaultDoctorDeps);
  if (options.json) {
    io.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    io.stdout.write(formatDoctorReport(report));
  }
  return ExitCode.Success;
}
