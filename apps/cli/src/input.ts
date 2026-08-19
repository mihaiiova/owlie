import { OwlieError, ValidationError } from '@owlieio/core';

/** The shape of an injected stdin stream. */
export interface StdinSource {
  isTTY: boolean;
  content: string;
}

export type ProcessInputSource =
  | { kind: 'file'; path: string }
  | { kind: 'input'; path: string }
  | { kind: 'stdin'; content: string };

/**
 * Resolves the single text input for `owlie process` from a positional file,
 * `--input FILE`, or piped stdin. Rejects ambiguous multiple inputs and empty
 * stdin: ambiguity and missing input throw {@link ValidationError} (exit code
 * 2); empty piped stdin throws a plain {@link OwlieError} (exit code 1).
 */
export function resolveProcessInput(args: {
  positional?: string;
  input?: string;
  stdin?: StdinSource;
}): ProcessInputSource {
  const piped = args.stdin !== undefined && !args.stdin.isTTY;
  const provided = [args.positional !== undefined, args.input !== undefined, piped].filter(
    Boolean,
  ).length;

  if (provided > 1) {
    throw new ValidationError(
      'ambiguous input: provide exactly one of a file argument, --input, or stdin',
    );
  }

  if (args.positional !== undefined) return { kind: 'file', path: args.positional };
  if (args.input !== undefined) return { kind: 'input', path: args.input };

  if (piped) {
    const content = args.stdin?.content ?? '';
    if (content.trim() === '') {
      throw new OwlieError('stdin is empty');
    }
    return { kind: 'stdin', content };
  }

  throw new ValidationError('no input provided: pass a file, --input, or pipe to stdin');
}
