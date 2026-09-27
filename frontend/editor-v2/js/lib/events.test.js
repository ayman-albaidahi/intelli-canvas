import { describe, it, expect, vi, beforeEach } from 'vitest';

import { bus, events } from './events.js';

describe('event bus', () => {
  beforeEach(() => {
    // Handlers persist on the module singleton, so a leak from one test
    // would fire in the next. Start every case from an empty bus.
    bus.clear();
  });

  it('delivers a payload to a subscribed handler', () => {
    const handler = vi.fn();
    bus.on(events.operation, handler);

    bus.emit(events.operation, { imageId: 'img-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ imageId: 'img-1' });
  });

  it('keeps the ic-operation name the DOM version used', () => {
    // The history manager and main.js listen for this literal string. This
    // assertion pins the contract so a rename here cannot silently orphan
    // a listener that still subscribes by name.
    expect(events.operation).toBe('ic-operation');
    expect(events.appStateChange).toBe('appstatechange');
    expect(events.authRequired).toBe('ic-auth-required');
  });

  it('supports several handlers on one event', () => {
    const first = vi.fn();
    const second = vi.fn();
    bus.on(events.operation, first);
    bus.on(events.operation, second);

    bus.emit(events.operation);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not deliver to handlers subscribed to another event', () => {
    const handler = vi.fn();
    bus.on(events.operation, handler);

    bus.emit(events.authRequired, 'session expired');

    expect(handler).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function from on', () => {
    const handler = vi.fn();
    const unsubscribe = bus.on(events.operation, handler);

    unsubscribe();
    bus.emit(events.operation);

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores a payload when no handler is subscribed', () => {
    // Emitting before anything subscribes must not throw — the canvas
    // manager fires ic-operation during startup wiring.
    expect(() => bus.emit(events.operation)).not.toThrow();
  });

  it('does not stop remaining handlers when one throws', () => {
    // A panel failing to refresh must not silently drop the history
    // refresh; the error is logged instead of swallowed.
    const broken = vi.fn(() => {
      throw new Error('boom');
    });
    const after = vi.fn();
    bus.on(events.operation, broken);
    bus.on(events.operation, after);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.emit(events.operation);

    expect(broken).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('removes a handler only once', () => {
    const handler = vi.fn();
    bus.on(events.operation, handler);

    bus.off(events.operation, handler);
    bus.off(events.operation, handler);
    bus.emit(events.operation);

    expect(handler).not.toHaveBeenCalled();
  });

  it('off is a no-op for a handler that was never subscribed', () => {
    expect(() => bus.off(events.operation, () => {})).not.toThrow();
  });

  it('clear drops every subscriber', () => {
    const handler = vi.fn();
    bus.on(events.operation, handler);

    bus.clear();
    bus.emit(events.operation);

    expect(handler).not.toHaveBeenCalled();
  });
});
