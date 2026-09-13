window.__errors = [];
window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', function (e) { window.__errors.push('promise: ' + String(e.reason && e.reason.message || e.reason)); });
