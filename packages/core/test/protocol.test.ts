import { describe, expect, it } from 'vitest';
import { JSON_PROTOCOL_SCHEMA_VERSION } from '@owlieio/core';

describe('JSON subprocess protocol', () => {
  it('begins at schema version 1', () => {
    expect(JSON_PROTOCOL_SCHEMA_VERSION).toBe(1);
  });
});
