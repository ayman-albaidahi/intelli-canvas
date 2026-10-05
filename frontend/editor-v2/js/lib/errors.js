/**
 * Unified error reporting — the editor's single error exit.
 *
 * Before this module every manager caught errors its own way: some toasted
 * error.message, some wrote the status bar, some logged to the console, and
 * a good number let the rejection escape silently. The restructuring plan's
 * diagnosis (problem 15) named exactly this: no central error surface, no
 * trail a future telemetry feature could subscribe to.
 *
 * handleError is the shape the plan prescribed — log with context, show the
 * user something, emit `ic-error` — plus one deliberate addition: the error
 * is normalised first (an Error instance, a bare string, or an API envelope
 * `{ success: false, error: { code, message } }` are all accepted), because
 * that is what the codebase actually throws at it.
 */

import { bus, events } from './events.js';
import { showToast } from './toast.js';

/**
 * Reduce whatever was thrown to a user-presentable message plus a code.
 * API rejections carry the backend error envelope; anything else gets a
 * generic fallback rather than "undefined" leaking into the toast.
 *
 * @param {unknown} error
 * @returns {{ message: string, code: string }}
 */
export function normalizeError(error) {
  if (error && typeof error === 'object') {
    const message = error.message || error?.error?.message;
    const code = error.code || error?.error?.code;
    if (message) return { message, code: code || 'OPERATION_FAILED' };
  }
  if (typeof error === 'string' && error.trim()) {
    return { message: error, code: 'OPERATION_FAILED' };
  }
  return { message: 'An unexpected error occurred', code: 'UNKNOWN_ERROR' };
}

/**
 * Report one failure: console trail, user toast, `ic-error` on the bus.
 *
 * Never throws — it is called from catch blocks, and an error reporter that
 * can itself fail turns a handled exception into an unhandled one. The
 * emit is wrapped for the same reason a throwing bus handler is isolated.
 *
 * @param {unknown} error whatever was caught
 * @param {string} context a short label, e.g. 'history.undo' or 'upload'
 */
export function handleError(error, context = 'unknown') {
  const { message, code } = normalizeError(error);
  console.error(`[${context}]`, error);
  showToast(message);
  try {
    bus.emit(events.error, { error: { message, code, context }, original: error });
  } catch (handlerError) {
    // A subscriber throwing must not replace the error being reported;
    // log it as a secondary failure and move on.
    console.error(`[${context}] an ic-error subscriber threw`, handlerError);
  }
  return { message, code, context };
}
