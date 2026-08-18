import type { CliIo } from './io.js';
import { ExitCode } from './io.js';
import { commandHelp, helpText, PLANNED_COMMANDS } from './commands/help.js';
import { runDoctorCommand, type DoctorDeps } from './commands/doctor.js';
import { VERSION } from './version.js';

export interface CliOptions {
  quiet: boolean;
  json: boolean;
  envFile?: string;
}

export interface CliDeps {
  doctor?: DoctorDeps;
}

interface ParsedArgs {
  args: string[];
  options: CliOptions;
  helpRequested: boolean;
  versionRequested: boolean;
  usageError?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: CliOptions = { quiet: false, json: false };
  const args: string[] = [];
  let helpRequested = false;
  let versionRequested = false;
  let usageError: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--help':
      case '-h':
        helpRequested = true;
        break;
      case '--version':
      case '-V':
        versionRequested = true;
        break;
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--env-file': {
        const next = argv[i + 1];
        if (next === undefined) {
          usageError = '--env-file requires a path';
        } else {
          options.envFile = next;
          i++;
        }
        break;
      }
      default:
        if (arg.startsWith('--env-file=')) {
          options.envFile = arg.slice('--env-file='.length);
        } else {
          args.push(arg);
        }
    }
  }

  return { args, options, helpRequested, versionRequested, usageError };
}

function notImplemented(command: string, options: CliOptions, io: CliIo): number {
  const message = `${command} is not implemented yet`;
  if (options.json) {
    io.stdout.write(JSON.stringify({ command, status: 'not-implemented', error: message }) + '\n');
  } else if (!options.quiet) {
    io.stderr.write(`owlie: ${message}\n`);
  }
  return ExitCode.NotImplemented;
}

export async function run(argv: string[], io: CliIo, deps: CliDeps = {}): Promise<number> {
  const parsed = parseArgs(argv);
  const options = parsed.options;

  if (parsed.versionRequested) {
    io.stdout.write(`owlie ${VERSION}\n`);
    return ExitCode.Success;
  }

  if (parsed.usageError) {
    if (!options.quiet) io.stderr.write(`owlie: ${parsed.usageError}\n`);
    return ExitCode.Usage;
  }

  const [command] = parsed.args;

  if (parsed.helpRequested) {
    if (command !== undefined && command !== 'help') {
      io.stdout.write(commandHelp(command) + '\n');
    } else {
      io.stdout.write(helpText() + '\n');
    }
    return ExitCode.Success;
  }

  if (command === undefined || command === 'help') {
    io.stdout.write(helpText() + '\n');
    return ExitCode.Success;
  }

  if (command === 'doctor') {
    return runDoctorCommand(io, options, deps.doctor);
  }

  if ((PLANNED_COMMANDS as readonly string[]).includes(command)) {
    return notImplemented(command, options, io);
  }

  if (!options.quiet) {
    io.stderr.write(`owlie: unknown command "${command}"\n`);
    io.stderr.write('Run "owlie --help" for usage.\n');
  }
  return ExitCode.Usage;
}
