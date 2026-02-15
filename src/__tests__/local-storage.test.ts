import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lsGet, lsSet, lsRemove, lsGetJSON, lsSetJSON } from '../lib/local-storage';

describe('local-storage helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('lsSet / lsGet / lsRemove work as expected', () => {
    expect(lsGet('x')).toBeNull();
    lsSet('x', 'y');
    expect(window.localStorage.getItem('x')).toBe('y');
    expect(lsGet('x')).toBe('y');
    lsRemove('x');
    expect(lsGet('x')).toBeNull();
  });

  it('lsSetJSON / lsGetJSON persist and parse objects, and remove on null', () => {
    lsSetJSON('obj', { a: 1, b: 'z' });
    expect(lsGetJSON('obj')).toEqual({ a: 1, b: 'z' });

    // null removes
    lsSetJSON('obj', null as any);
    expect(lsGetJSON('obj')).toBeNull();
  });

  it('lsGetJSON returns fallback on invalid JSON', () => {
    window.localStorage.setItem('bad', 'not-json');
    expect(lsGetJSON('bad', { ok: true })).toEqual({ ok: true });
  });
});
