import type { CliIo } from './io.js';
import { ExitCode } from './io.js';
import { commandHelp, helpText } from './commands/help.js';
import { runAuthCommand, type AuthDeps } from './commands/auth.js';
import { runDoctorCommand, type DoctorDeps } from './commands/doctor.js';
import { runExtractCommand, type ExtractDeps } from './commands/extract.js';
import { runListCommand, type ListDeps } from './commands/list.js';
import { runProcessCommand, type ProcessDeps } from './commands/process.js';
import { runResolveCommand, type ResolveDeps } from './commands/resolve.js';
import { runSetupCommand, type SetupDeps } from './commands/setup.js';
import { resolverFlagForName, resolverNameForFlag } from './resolvers.js';
import { VERSION } from './version.js';

export interface CliOptions {
  quiet: boolean;
  json: boolean;
  each: boolean;
  envFile?: string;
  input?: string;
  inputFormat?: 'text' | 'json';
  prompt?: string;
  model?: string;
  provider?: string;
  language?: string;
  limit?: string;
  /** End-to-end extraction deadline in milliseconds for direct media. */
  timeoutMs?: string;
  /** Maximum direct-media download size in bytes. */
  maxMediaBytes?: string;
  /** Stable name of the selected audio resolver (from a resolver-selection flag). */
  resolver?: string;
}

export interface CliDeps {
  auth?: AuthDeps;
  doctor?: DoctorDeps;
  extract?: ExtractDeps;
  list?: ListDeps;
  process?: ProcessDeps;
  resolve?: ResolveDeps;
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
  const options: CliOptions = { quiet: false, json: false, each: false };
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
    '--provider',
    '--language',
    '--limit',
    '--timeout-ms',
    '--max-media-bytes',
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
      case '--provider':
        options.provider = value;
        break;
      case '--language':
        options.language = value;
        break;
      case '--limit':
        options.limit = value;
        break;
      case '--timeout-ms':
        options.timeoutMs = value;
        break;
      case '--max-media-bytes':
        options.maxMediaBytes = value;
        break;
    }
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    const resolverName = resolverNameForFlag(arg);
    if (resolverName !== undefined) {
      if (options.resolver !== undefined) {
        const previous = resolverFlagForName(options.resolver) ?? options.resolver;
        usageError = `cannot combine resolver flags "${previous}" and "${arg}"`;
      } else {
        options.resolver = resolverName;
      }
      continue;
    }
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
      case '--each':
        options.each = true;
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

  if (command === 'auth') {
    return runAuthCommand(parsed.args.slice(1), io, options, deps.auth);
  }

  if (command === 'extract') {
    return runExtractCommand(parsed.args.slice(1), io, options, deps.extract);
  }

  if (command === 'list') {
    return runListCommand(parsed.args.slice(1), io, options, deps.list);
  }

  if (command === 'process') {
    return runProcessCommand(parsed.args.slice(1), io, options, deps.process);
  }

  if (command === 'resolve') {
    return runResolveCommand(parsed.args.slice(1), io, options, deps.resolve);
  }

  if (command === 'setup') {
    return runSetupCommand(io, options, deps.setup);
  }

  if (!options.quiet) {
    io.stderr.write(`owlie: unknown command "${command}"\n`);
    io.stderr.write('Run "owlie --help" for usage.\n');
  }
  return ExitCode.Usage;
}
