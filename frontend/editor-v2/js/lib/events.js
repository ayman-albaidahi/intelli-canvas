/**
 * Central event bus.
 *
 * Before this module existed, managers signalled each other by firing
 * CustomEvents on `document` (`ic-operation`, `appstatechange`) and on
 * `window` (`ic-auth-required`). That worked, but it tied every manager to
 * the DOM, scattered the event names as string literals across thirteen
 * files, and gave no single place to see the application's event surface.
 *
 * The bus keeps the same event names — `ic-operation` is what the history
 * manager listens for — so this is a change of transport, not of contract.
 * Managers import `bus` and call `emit`/`on` instead of reaching for
 * `document`.
 *
 * `on` returns an unsubscribe function rather than requiring a paired `off`
 * call, because every listener site in this codebase is a long-lived
 * manager that would otherwise have to track the handler it registered.
 */

const handlers = new Map();

export const bus = {
  /**
   * Subscribe to `event`. Returns a function that removes the handler, so
   * callers can unsubscribe without keeping a reference to the function
   * they passed in.
   *
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void}
   */
  on(event, handler) {
    const listeners = handlers.get(event);
    if (listeners) {
      listeners.add(handler);
    } else {
      handlers.set(event, new Set([handler]));
    }
    return () => this.off(event, handler);
  },

  /**
   * Remove a handler previously registered with `on`. Safe to call with a
   * handler that was never subscribed — the Set lookup is a no-op.
   *
   * @param {string} event
   * @param {(payload: any) => void} handler
   */
  off(event, handler) {
    handlers.get(event)?.delete(handler);
  },

  /**
   * Drop every subscriber. Called on application teardown so a hot reload
   * or a second editor instance does not inherit the previous one's
   * listeners — which would double every refresh.
   */
  clear() {
    handlers.clear();
  },

  /**
   * Deliver `payload` to every subscriber of `event`, in subscription
   * order. A handler throwing does not stop the remaining handlers, since
   * one panel failing to refresh should not silently drop the history
   * refresh; the error is reported to the console so it is not swallowed.
   *
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    const listeners = handlers.get(event);
    if (!listeners) {
      return;
    }
    for (const handler of [...listeners]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[bus] handler for "${event}" threw`, error);
      }
    }
  },
};

/**
 * The event names the application uses, declared once.
 *
 * `ic-operation` is the "an image-changing operation finished" signal: it
 * tells the history manager to refresh and the layer list to rebuild.
 * `appstatechange` carries the whole serialisable app state. `ic-auth-
 * required` fires when the API rejects a request's session. `ic-error`
 * carries `{ error, context }` for anything routed through handleError —
 * the seam a telemetry or error-panel feature subscribes to.
 */
export const events = Object.freeze({
  operation: 'ic-operation',
  appStateChange: 'appstatechange',
  authRequired: 'ic-auth-required',
  error: 'ic-error',
});
