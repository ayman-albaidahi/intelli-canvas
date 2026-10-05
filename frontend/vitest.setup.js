// Node >= 20 ships undici's global URL, which has no object-URL methods, and
// jsdom does not fill the gap. The editor's download path creates blob URLs
// and defers their revocation by a second so the browser can start the
// download; without stubs, those deferred timers fire after the test that
// scheduled them has restored the (undefined) real methods and throw
// "URL.revokeObjectURL is not a function" as an uncaught error that fails the
// whole run. Tests that need to assert on the calls override these with
// vi.fn() in their own hooks.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:setup';
  URL.revokeObjectURL = () => {};
}
