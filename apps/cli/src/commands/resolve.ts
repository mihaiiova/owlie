import type { HttpFetcher } from '@owlieio/core';
import { ConfigurationError, DefaultHttpFetcher, assertNoUrlCredentials } from '@owlieio/core';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { resolvePodcastAudio } from '../resolvers.js';
import type { PodcastResolverRegistration } from '../resolvers.js';
import { writeDiagnostic } from '../style.js';

/** Injectable seams for `owlie resolve` (tests substitute an offline fetcher). */
export interface ResolveDeps {
  fetcher?: HttpFetcher;
  registry?: readonly PodcastResolverRegistration[];
  signal?: AbortSignal;
}

/**
 * Resolves a URL to a validated media URL without downloading or transcribing.
 * With a resolver-selection flag it is authoritative; without one, resolvers
 * run in recognition order. Writes the media URL (or a JSON envelope with
 * `--json`) to stdout; diagnostics stay on stderr.
 */
export async function runResolveCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: ResolveDeps = {},
): Promise<number> {
  const [url, extra] = args;
  if (url === undefined) {
    if (!options.quiet) writeDiagnostic(io, 'warning', 'resolve requires a URL');
    return ExitCode.Usage;
  }
  if (extra !== undefined) {
    if (!options.quiet) writeDiagnostic(io, 'warning', `unexpected argument "${extra}"`);
    return ExitCode.Usage;
  }

  const fetcher = deps.fetcher ?? new DefaultHttpFetcher();
  try {
    assertNoUrlCredentials(url);
    const resolved = await resolvePodcastAudio(url, {
      fetcher,
      registry: deps.registry,
      resolverName: options.resolver,
      signal: deps.signal,
    });
    if (options.json) {
      io.stdout.write(
        JSON.stringify({
          schemaVersion: 1,
          resolver: resolved.resolver,
          mediaUrl: resolved.mediaUrl,
          metadata: resolved.metadata ?? {},
        }) + '\n',
      );
    } else {
      io.stdout.write(resolved.mediaUrl + '\n');
    }
    return ExitCode.Success;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      if (!options.quiet) writeDiagnostic(io, 'warning', error.message);
      return ExitCode.Usage;
    }
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      writeDiagnostic(io, 'error', message);
    }
    return exitCodeForError(error);
  }
}
