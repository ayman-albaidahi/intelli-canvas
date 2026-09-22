import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appState, setState } from './app-state.js';
import {
  beginOperation, completeOperation, dismissError, failOperation, retryOperation,
} from './operation-state.js';

describe('operation state', () => {
  beforeEach(() => {
    setState({ editorReady: true, activeTool: 'select', selectedObjectId: null, processing: { active: false, operation: null, progress: null, cancellable: false }, error: null });
  });

  it('enters Processing and clears a previous Error', () => {
    setState({ error: { code: 'OLD', message: 'old' } });
    const token = beginOperation({ operation: 'Applying crop' });
    expect(token).not.toBeNull();
    expect(appState.processing).toMatchObject({ active: true, operation: 'Applying crop' });
    expect(appState.error).toBeNull();
  });

  it('completes only the current operation', () => {
    const token = beginOperation({ operation: 'Resize' });
    completeOperation(token + 1);
    expect(appState.processing.active).toBe(true);
    completeOperation(token);
    expect(appState.processing.active).toBe(false);
  });

  it('enters Error with a safe public message and retry capability', () => {
    const retry = vi.fn();
    const token = beginOperation({ operation: 'Applying crop', retry });
    failOperation(token, { code: 'NETWORK_FAILURE', message: 'Try again.' }, 'Applying crop');
    expect(appState.inspectorContext).toBe('error');
    expect(appState.error).toMatchObject({ code: 'NETWORK_FAILURE', message: 'Try again.', retryable: true });
    expect(retryOperation()).toBe(true);
    expect(retry).toHaveBeenCalledOnce();
    expect(appState.error).toBeNull();
  });

  it('dismisses an Error and returns to the derived context', () => {
    const token = beginOperation({ operation: 'Rotate' });
    failOperation(token, new Error('failed'), 'Rotate');
    dismissError();
    expect(appState.error).toBeNull();
    expect(appState.inspectorContext).toBe('image');
  });
});
