import { describe, expect, it } from 'vitest';
import { formatStorageUsage } from './settings-page.component';

describe('formatStorageUsage', () => {
  it('describes loading and unavailable estimates', () => {
    expect(formatStorageUsage(undefined)).toBe('Calculating…');
    expect(formatStorageUsage(null)).toBe('Unavailable');
  });

  it('formats bytes and binary unit boundaries', () => {
    expect(formatStorageUsage(0)).toBe('0 B');
    expect(formatStorageUsage(1023)).toBe('1023 B');
    expect(formatStorageUsage(1024)).toBe('1 KB');
    expect(formatStorageUsage(12.5 * 1024 * 1024)).toBe('12.5 MB');
    expect(formatStorageUsage(2 * 1024 * 1024 * 1024)).toBe('2 GB');
  });
});
