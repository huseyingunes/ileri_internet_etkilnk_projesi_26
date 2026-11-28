import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from './timeout.js';

describe('withTimeout', () => {
  it('resolves when the task finishes in time', async () => {
    await expect(withTimeout('fast', 100, Promise.resolve(42))).resolves.toBe(42);
  });

  it('rejects with TimeoutError when the task is too slow', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout('slow', 10, slow)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('propagates the task error', async () => {
    await expect(withTimeout('fail', 100, Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
  });
});
