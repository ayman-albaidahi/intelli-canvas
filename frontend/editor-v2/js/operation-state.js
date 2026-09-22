import { appState, setState } from './app-state.js';

let retryHandler = null;
let operationToken = 0;

function publicError(error, operation) {
  return {
    active: true,
    code: error?.code || error?.error?.code || 'OPERATION_FAILED',
    message: error?.message || 'The operation could not be completed. Try again.',
    operation,
    retryable: Boolean(retryHandler),
  };
}

export function beginOperation({ operation, cancellable = false, retry = null } = {}) {
  if (appState.processing?.active) return null;
  operationToken += 1;
  retryHandler = typeof retry === 'function' ? retry : null;
  setState({
    processing: {
      active: true,
      operation: operation || 'Working',
      progress: null,
      cancellable: Boolean(cancellable),
    },
    error: null,
  });
  return operationToken;
}

export function completeOperation(token) {
  if (token !== operationToken) return;
  retryHandler = null;
  setState({ processing: { active: false, operation: null, progress: null, cancellable: false } });
}

export function failOperation(token, error, operation) {
  if (token !== operationToken) return;
  setState({
    processing: { active: false, operation: null, progress: null, cancellable: false },
    error: publicError(error, operation),
  });
}

export function dismissError() {
  retryHandler = null;
  setState({ error: null });
}

export function retryOperation() {
  const retry = retryHandler;
  if (!retry) return false;
  retryHandler = null;
  setState({ error: null });
  retry();
  return true;
}

export function getOperationState() {
  return { processing: appState.processing, error: appState.error };
}
