import type { CliIo } from './io.js';
import { ExitCode, exitCodeForError } from './io.js';
import {
  boundedIo,
  combineSignals,
  createDeadline,
  networkPolicyFromBytes,
  OutputLimitExceededError,
  parsePositiveIntegerFlag,
} from './invocation.js';
import {
  USAGE_ERROR_CODE,
  writeCommandError,
  writeErrorRecord,
  writeResultEnvelope,
  writeUsageError,
} from './protocol.js';
import { writeDiagnostic } from './style.js';
import { isCommandId } from './commands/catalog.js';
import { commandHelp, helpText } from './commands/help.js';
import { runAuthCommand, type AuthDeps } from './commands/auth.js';
import { runCapabilitiesCommand } from './capabilities.js';
import { runDoctorCommand, type DoctorDeps } from './commands/doctor.js';
import { runExtractCommand, type ExtractDeps } from './commands/extract.js';
import { runListCommand, type ListDeps } from './commands/list.js';
import { runModelsCommand, type ModelsDeps } from './commands/models.js';
import { runProcessCommand, type ProcessDeps } from './commands/process.js';
import { runResolveCommand, type ResolveDeps } from './commands/resolve.js';
import { runSetupCommand, type SetupDeps } from './commands/setup.js';
import { resolverFlagForName, resolverNameForFlag } from './resolvers.js';
import { VERSION } from './version.js';

export interface CliOptions {
  quiet: boolean;
  json: boolean;
  each: boolean;
  refresh: boolean;
  hosted: boolean;
  envFile?: string;
  input?: string;
  inputFormat?: 'text' | 'json';
  prompt?: string;
  model?: string;
  provider?: string;
  language?: string;
  limit?: string;
  /** Invocation-wide deadline in milliseconds (listing, HTTP, extraction, transcription, feeds, providers). */
  timeoutMs?: string;
  /** Maximum direct-media download size in bytes. */
  maxMediaBytes?: string;
  /** Command-wide maximum network download bytes. */
  maxNetworkBytes?: string;
  /** Command-wide maximum stdout bytes. */
  maxStdoutBytes?: string;
  /** Stable name of the selected audio resolver (from a resolver-selection flag). */
  resolver?: string;
}

export interface CliDeps {
  auth?: AuthDeps;
  doctor?: DoctorDeps;
  extract?: ExtractDeps;
  list?: ListDeps;
  models?: ModelsDeps;
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
  const options: CliOptions = {
    quiet: false,
    json: false,
    each: false,
    refresh: false,
    hosted: false,
  };
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
    '--max-network-bytes',
    '--max-stdout-bytes',
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
      case '--max-network-bytes':
        options.maxNetworkBytes = value;
        break;
      case '--max-stdout-bytes':
        options.maxStdoutBytes = value;
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
      case '--refresh':
        options.refresh = true;
        break;
      case '--hosted':
        options.hosted = true;
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
  const [command] = parsed.args;

  // Validate invocation-wide budgets before producing any output so a bad
  // value is always a usage error regardless of the selected command.
  let timeoutMs: number | undefined;
  let maxNetworkBytes: number | undefined;
  let maxStdoutBytes: number | undefined;
  try {
    timeoutMs = parsePositiveIntegerFlag(options.timeoutMs, '--timeout-ms');
    maxNetworkBytes = parsePositiveIntegerFlag(options.maxNetworkBytes, '--max-network-bytes');
    maxStdoutBytes = parsePositiveIntegerFlag(options.maxStdoutBytes, '--max-stdout-bytes');
  } catch (error) {
    if (!options.quiet) writeUsageError(io, options, command ?? 'owlie', (error as Error).message);
    return ExitCode.Usage;
  }

  const bounded = boundedIo(io, maxStdoutBytes);
  const networkPolicy = networkPolicyFromBytes(maxNetworkBytes);
  const deadline = timeoutMs === undefined ? undefined : createDeadline(timeoutMs);

  const compose = (commandSignal: AbortSignal | undefined) => {
    if (deadline === undefined) return { signal: commandSignal, cleanup: () => {} };
    return combineSignals(deadline.signal, commandSignal);
  };

  try {
    if (parsed.versionRequested) {
      if (options.json) {
        writeResultEnvelope(bounded, 'version', VERSION);
      } else {
        bounded.stdout.write(`owlie ${VERSION}\n`);
      }
      return ExitCode.Success;
    }

    if (parsed.usageError) {
      if (!options.quiet) writeUsageError(bounded, options, command ?? 'owlie', parsed.usageError);
      return ExitCode.Usage;
    }

    if (parsed.helpRequested) {
      if (command !== undefined && command !== 'help') {
        bounded.stdout.write(commandHelp(command) + '\n');
      } else {
        bounded.stdout.write(helpText() + '\n');
      }
      return ExitCode.Success;
    }

    if (command === undefined || command === 'help') {
      bounded.stdout.write(helpText() + '\n');
      return ExitCode.Success;
    }

    if (!isCommandId(command)) {
      if (!options.quiet) {
        if (options.json) {
          writeErrorRecord(bounded, command, USAGE_ERROR_CODE, `unknown command "${command}"`);
        } else {
          writeDiagnostic(bounded, 'warning', `unknown command "${command}"`);
          bounded.stderr.write('Run "owlie --help" for usage.\n');
        }
      }
      return ExitCode.Usage;
    }

    if (options.hosted) {
      if (options.envFile !== undefined) {
        if (!options.quiet)
          writeUsageError(
            bounded,
            options,
            command ?? 'owlie',
            '--env-file cannot be used with --hosted',
          );
        return ExitCode.Usage;
      }
      if (command === 'auth' || command === 'setup') {
        if (!options.quiet)
          writeUsageError(
            bounded,
            options,
            command,
            `command "${command}" is not available in hosted mode`,
          );
        return ExitCode.Usage;
      }
    }

    if (command === 'doctor') {
      return runDoctorCommand(bounded, options, deps.doctor);
    }

    if (command === 'capabilities') {
      return runCapabilitiesCommand(bounded, options);
    }

    if (command === 'auth') {
      return runAuthCommand(parsed.args.slice(1), bounded, options, deps.auth);
    }

    if (command === 'models') {
      const combined = compose(deps.models?.signal);
      try {
        return await runModelsCommand(bounded, options, {
          ...deps.models,
          signal: combined.signal,
          networkPolicy,
        });
      } finally {
        combined.cleanup();
      }
    }

    if (command === 'extract') {
      const combined = compose(deps.extract?.signal);
      try {
        return await runExtractCommand(parsed.args.slice(1), bounded, options, {
          ...deps.extract,
          signal: combined.signal,
          networkPolicy,
        });
      } finally {
        combined.cleanup();
      }
    }

    if (command === 'list') {
      const combined = compose(deps.list?.signal);
      try {
        return await runListCommand(parsed.args.slice(1), bounded, options, {
          ...deps.list,
          signal: combined.signal,
          networkPolicy,
        });
      } finally {
        combined.cleanup();
      }
    }

    if (command === 'process') {
      const combined = compose(deps.process?.signal);
      try {
        return await runProcessCommand(parsed.args.slice(1), bounded, options, {
          ...deps.process,
          signal: combined.signal,
          networkPolicy,
        });
      } finally {
        combined.cleanup();
      }
    }

    if (command === 'resolve') {
      const combined = compose(deps.resolve?.signal);
      try {
        return await runResolveCommand(parsed.args.slice(1), bounded, options, {
          ...deps.resolve,
          signal: combined.signal,
          networkPolicy,
        });
      } finally {
        combined.cleanup();
      }
    }

    if (command === 'setup') {
      const combined = compose(deps.setup?.signal);
      try {
        return await runSetupCommand(bounded, options, {
          ...deps.setup,
          signal: combined.signal,
          networkPolicy,
        });
      } finally {
        combined.cleanup();
      }
    }

    // Every registered command is handled above. Keep this guard for future
    // registrations whose implementation branch has not yet been added.
    throw new Error(`registered command is missing a dispatch handler: ${command}`);
  } catch (error) {
    // A stdout budget overflow can escape command-local handlers (help/version
    // and unknown-command paths write directly); surface it as a normal error.
    if (error instanceof OutputLimitExceededError) {
      if (!options.quiet) writeCommandError(bounded, options, command ?? 'owlie', error);
      return exitCodeForError(error);
    }
    throw error;
  } finally {
    deadline?.cleanup();
  }
}
