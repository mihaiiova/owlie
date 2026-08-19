import type { CliIo } from './io.js';
import { ExitCode } from './io.js';
import { commandHelp, helpText, PLANNED_COMMANDS } from './commands/help.js';
import { runDoctorCommand, type DoctorDeps } from './commands/doctor.js';
import { runExtractCommand, type ExtractDeps } from './commands/extract.js';
import { runProcessCommand, type ProcessDeps } from './commands/process.js';
import { runSetupCommand, type SetupDeps } from './commands/setup.js';
import { VERSION } from './version.js';

export interface CliOptions {
  quiet: boolean;
  json: boolean;
  envFile?: string;
  input?: string;
  inputFormat?: 'text' | 'json';
  prompt?: string;
  model?: string;
  language?: string;
}

export interface CliDeps {
  doctor?: DoctorDeps;
  extract?: ExtractDeps;
  process?: ProcessDeps;
  setup?: SetupDeps;
}

export interface ParsedArgs {
  args: string[];
  options: CliOptions;
  helpRequested: boolean;
  versionRequested: boolean;
  usageError?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const options: CliOptions = { quiet: false, json: false };
  const args: string[] = [];
  let helpRequested = false;
  let versionRequested = false;
  let usageError: string | undefined;

  const KNOWN_VALUE_FLAGS: readonly string[] = [
    '--env-file',
    '--input',
    '--input-format',
    '--prompt',
    '--model',
    '--language',
  ];

  const applyValue = (key: string, value: string | undefined): void => {
    if (value === undefined) {
      usageError = `${key} requires a value`;
      return;
    }
    switch (key) {
      case '--env-file':
        options.envFile = value;
        break;
      case '--input':
        options.input = value;
        break;
      case '--input-format':
        if (value === 'text' || value === 'json') {
          options.inputFormat = value;
        } else {
          usageError = `--input-format must be "text" or "json", received "${value}"`;
        }
        break;
      case '--prompt':
        options.prompt = value;
        break;
      case '--model':
        options.model = value;
        break;
      case '--language':
        options.language = value;
        break;
    }
  };

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
      default: {
        if (KNOWN_VALUE_FLAGS.includes(arg)) {
          const next = argv[i + 1];
          applyValue(arg, next);
          if (next !== undefined) i++;
        } else {
          const eq = arg.indexOf('=');
          const key = eq > 0 ? arg.slice(0, eq) : undefined;
          if (key !== undefined && KNOWN_VALUE_FLAGS.includes(key)) {
            applyValue(key, arg.slice(eq + 1));
          } else {
            args.push(arg);
          }
        }
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

  if (command === 'extract') {
    return runExtractCommand(parsed.args.slice(1), io, options, deps.extract);
  }

  if (command === 'process') {
    return runProcessCommand(parsed.args.slice(1), io, options, deps.process);
  }

  if (command === 'setup') {
    return runSetupCommand(io, options, deps.setup);
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
