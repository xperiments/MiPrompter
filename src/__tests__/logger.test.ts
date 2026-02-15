import { describe, it, expect, vi, afterEach } from 'vitest';
import * as logger from '../lib/logger';

describe('logger utility', () => {
  afterEach(() => {
    // reset debug flag after each test
    logger.enableDebug(true);
    vi.restoreAllMocks();
  });

  it('debug is gated by enableDebug()', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {} as any);

    logger.enableDebug(false);
    logger.debug('nope');
    expect(spy).not.toHaveBeenCalled();

    logger.enableDebug(true);
    logger.debug('yes');
    expect(spy).toHaveBeenCalledWith('yes');

    spy.mockRestore();
  });

  it('warn/info/error forward to console', () => {
    const sw = vi.spyOn(console, 'warn').mockImplementation(() => {} as any);
    const si = vi.spyOn(console, 'info').mockImplementation(() => {} as any);
    const se = vi.spyOn(console, 'error').mockImplementation(() => {} as any);

    logger.warn('w');
    logger.info('i');
    logger.error('e');

    expect(sw).toHaveBeenCalledWith('w');
    expect(si).toHaveBeenCalledWith('i');
    expect(se).toHaveBeenCalledWith('e');

    sw.mockRestore();
    si.mockRestore();
    se.mockRestore();
  });
});
