import { describe, expect, it } from 'vitest';
import { CancelledError, ConfigurationError, NotImplementedError, OwlieError } from '@owlieio/core';

describe('error hierarchy', () => {
  it('assigns stable codes', () => {
    expect(new OwlieError('x').code).toBe('OWLIE_ERROR');
    expect(new ConfigurationError('x').code).toBe('CONFIGURATION_ERROR');
    expect(new CancelledError().code).toBe('CANCELLED');
    expect(new NotImplementedError('x').code).toBe('NOT_IMPLEMENTED');
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
});
