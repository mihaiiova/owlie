import { describe, expect, it } from 'vitest';
import {
  CancelledError,
  CaptionsUnavailableError,
  ConfigurationError,
  ExtractionError,
  NotImplementedError,
  OwlieError,
} from '@owlieio/core';

describe('error hierarchy', () => {
  it('assigns stable codes', () => {
    expect(new OwlieError('x').code).toBe('OWLIE_ERROR');
    expect(new ConfigurationError('x').code).toBe('CONFIGURATION_ERROR');
    expect(new CancelledError().code).toBe('CANCELLED');
    expect(new NotImplementedError('x').code).toBe('NOT_IMPLEMENTED');
    expect(new ExtractionError('x').code).toBe('EXTRACTION_ERROR');
    expect(new CaptionsUnavailableError('x').code).toBe('CAPTIONS_UNAVAILABLE');
  });

  it('preserves a cause', () => {
    const cause = new Error('underlying');
    const err = new OwlieError('x', { cause });
    expect(err.cause).toBe(cause);
  });

  it('instances are proper Errors', () => {
    const err = new ConfigurationError('bad');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OwlieError);
    expect(err.message).toBe('bad');
  });

  it('classifies captions-unavailable as an extraction error', () => {
    const err = new CaptionsUnavailableError('no captions');
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err).toBeInstanceOf(OwlieError);
  });
});
