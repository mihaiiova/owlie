/**
 * Typed error hierarchy for Owlie CLI. Library packages must never call
 * `process.exit`; they throw these instead and let the CLI entry point decide
 * how to translate failures into exit codes.
 */
export class OwlieError extends Error {
  readonly code: string;

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? 'OWLIE_ERROR';
  }
}

export class ConfigurationError extends OwlieError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'CONFIGURATION_ERROR', cause: options.cause });
  }
}

export class ValidationError extends OwlieError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'VALIDATION_ERROR', cause: options.cause });
  }
}

export class ExtractionError extends OwlieError {
  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message, { code: options.code ?? 'EXTRACTION_ERROR', cause: options.cause });
  }
}

/**
 * Raised when content extraction succeeds but the requested artifact (for
 * example a YouTube transcript) is not available for the item.
 */
export class CaptionsUnavailableError extends ExtractionError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'CAPTIONS_UNAVAILABLE', cause: options.cause });
  }
}

export class TranscriptionError extends OwlieError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'TRANSCRIPTION_ERROR', cause: options.cause });
  }
}

export class ProcessingError extends OwlieError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'PROCESSING_ERROR', cause: options.cause });
  }
}

export class CancelledError extends OwlieError {
  constructor(message = 'operation cancelled', options: { cause?: unknown } = {}) {
    super(message, { code: 'CANCELLED', cause: options.cause });
  }
}

export class NotImplementedError extends OwlieError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'NOT_IMPLEMENTED', cause: options.cause });
  }
}
