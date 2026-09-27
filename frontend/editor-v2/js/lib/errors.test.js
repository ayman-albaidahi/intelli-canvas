import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { bus, events } from './events.js';
import { showToast } from './toast.js';
import { handleError, normalizeError } from './errors.js';

describe('toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast" aria-live="polite"></div>';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows the message, then hides it after the visible window', async () => {
    showToast('hello');
    const toast = document.querySelector('#toast');
    expect(toast.textContent).toBe('hello');
    expect(toast.classList.contains('is-visible')).toBe(true);

    vi.advanceTimersByTime(2300);
    expect(toast.classList.contains('is-visible')).toBe(false);
  });

  it('a second message resets the timer instead of stacking', async () => {
    showToast('first');
    vi.advanceTimersByTime(2000);
    showToast('second');
    vi.advanceTimersByTime(2000);

    const toast = document.querySelector('#toast');
    expect(toast.textContent).toBe('second');
    // 4000ms elapsed in total but the second reset the window at 2000;
    // at 2000 after the second call it is still visible.
    expect(toast.classList.contains('is-visible')).toBe(true);

    vi.advanceTimersByTime(300);
    expect(toast.classList.contains('is-visible')).toBe(false);
  });

  it('warns instead of throwing when the toast element is absent', async () => {
    document.body.innerHTML = '';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => showToast('orphan')).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('error handling', () => {
  let seen;
  let unsubscribe;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="toast" aria-live="polite"></div>';
    seen = [];
    unsubscribe = bus.on(events.error, (payload) => seen.push(payload));
  });

  afterEach(() => {
    unsubscribe();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('normalizeError', () => {
    it('reads a thrown Error', () => {
      expect(normalizeError(new Error('boom'))).toEqual({
        message: 'boom',
        code: 'OPERATION_FAILED',
      });
    });

    it('unwraps the API error envelope', () => {
      const error = new Error('request failed');
      error.code = 'IMAGE_NOT_FOUND';
      expect(normalizeError({ success: false, error: { code: 'IMAGE_NOT_FOUND', message: 'no such image' } })).toEqual({
        message: 'no such image',
        code: 'IMAGE_NOT_FOUND',
      });
      expect(normalizeError(error)).toEqual({ message: 'request failed', code: 'IMAGE_NOT_FOUND' });
    });

    it('accepts a bare string', () => {
      expect(normalizeError('failed')).toEqual({ message: 'failed', code: 'OPERATION_FAILED' });
    });

    it('falls back for undefined and empty values instead of leaking "undefined"', () => {
      expect(normalizeError(undefined).message).toBe('An unexpected error occurred');
      expect(normalizeError({}).code).toBe('UNKNOWN_ERROR');
      expect(normalizeError('').message).toBe('An unexpected error occurred');
    });
  });

  describe('handleError', () => {
    it('logs with context, toasts the message, and emits ic-error', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('server offline');

      const result = handleError(error, 'layers.save');

      expect(errorSpy).toHaveBeenCalledWith('[layers.save]', error);
      expect(document.querySelector('#toast').textContent).toBe('server offline');
      expect(seen).toHaveLength(1);
      expect(seen[0].error).toEqual({ message: 'server offline', code: 'OPERATION_FAILED', context: 'layers.save' });
      expect(seen[0].original).toBe(error);
      expect(result.context).toBe('layers.save');
      errorSpy.mockRestore();
    });

    it('never throws even when an ic-error subscriber throws', () => {
      const boom = bus.on(events.error, () => {
        throw new Error('bad subscriber');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => handleError(new Error('first'), 'test')).not.toThrow();
      // One log for the reported error, one for the secondary subscriber failure.
      expect(errorSpy).toHaveBeenCalledTimes(2);
      errorSpy.mockRestore();
      boom();
    });
  });
});
