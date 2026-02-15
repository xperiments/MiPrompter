import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setPresenterWsSender,
  sendToPresenterViaWs,
  hasPresenterWsSender,
  isPresenterMessage,
} from '../lib/presenter-transport';

describe('presenter-transport (runtime)', () => {
  afterEach(() => {
    // clear any registered sender
    setPresenterWsSender(null as any);
    vi.restoreAllMocks();
  });

  it('registers and uses a WS sender', () => {
    const calls: any[] = [];
    const sender = (msg: any) => {
      calls.push(msg);
      return true;
    };

    setPresenterWsSender(sender as any);
    expect(hasPresenterWsSender()).toBe(true);

    const ok = sendToPresenterViaWs({ type: 'play' } as any);
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ type: 'play' });

    // clear
    setPresenterWsSender(null as any);
    expect(hasPresenterWsSender()).toBe(false);
    expect(sendToPresenterViaWs({ type: 'play' } as any)).toBe(false);
  });

  it('handles sender exceptions gracefully', () => {
    const throwing = () => {
      throw new Error('boom');
    };

    setPresenterWsSender(throwing as any);
    expect(hasPresenterWsSender()).toBe(true);
    expect(sendToPresenterViaWs({ type: 'pause' } as any)).toBe(false);
  });

  it('runtime-guards PresenterMessage shapes', () => {
    expect(isPresenterMessage({ type: 'play' })).toBe(true);
    expect(isPresenterMessage({ type: 'presenter-playing', playing: true })).toBe(true);
    expect(isPresenterMessage({ type: 'presenter-goto-chapter', chapterId: 'c1' })).toBe(true);

    // missing required field
    expect(isPresenterMessage({ type: 'presenter-playing' })).toBe(false);
    expect(isPresenterMessage({})).toBe(false);

    // unknown/extension message types are allowed (per transport design)
    expect(isPresenterMessage({ type: 'custom-unknown', foo: 1 })).toBe(true);
  });
});
