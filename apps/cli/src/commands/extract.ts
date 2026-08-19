import type { ItemAdapter } from '@owlieio/core';
import { extractItem, resolveItem } from '@owlieio/core';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { readUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';

export interface ExtractDeps {
  adapter?: ItemAdapter;
  signal?: AbortSignal;
  readConfig?: () => UserConfig;
}

/** Parses a comma-separated `--language` value into a priority list. */
export function parseLanguages(language?: string): string[] | undefined {
  if (!language) return undefined;
  const languages = language
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return languages.length > 0 ? languages : undefined;
}

export async function runExtractCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: ExtractDeps = {},
): Promise<number> {
  const [url, extra] = args;
  if (url === undefined) {
    if (!options.quiet) io.stderr.write('owlie: extract requires a URL\n');
    return ExitCode.Usage;
  }
  if (extra !== undefined) {
    if (!options.quiet) io.stderr.write(`owlie: unexpected argument "${extra}"\n`);
    return ExitCode.Usage;
  }

  const readConfig = deps.readConfig ?? readUserConfig;
  const adapter =
    deps.adapter ??
    new YouTubeAdapter({ languages: parseLanguages(options.language), proxy: readConfig().proxy });

  try {
    const item = await resolveItem(adapter, { url });
    const document = await extractItem(adapter, item, {
      signal: deps.signal,
      progress: {
        emit: (event) => {
          if (options.quiet) return;
          if (event.type === 'started') {
            io.stderr.write(`owlie: extracting ${event.target}\n`);
          }
        },
      },
    });

    if (options.json) {
      io.stdout.write(JSON.stringify(document) + '\n');
    } else {
      io.stdout.write(document.text + '\n');
    }
    return ExitCode.Success;
  } catch (error) {
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`owlie: ${message}\n`);
    }
    return exitCodeForError(error);
  }
}
