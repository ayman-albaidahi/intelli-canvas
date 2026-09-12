# Fix: Initial Dialog Visibility

The Resize dialog was marked with the native `hidden` attribute, but the `.dialog-backdrop` rule assigned `display: grid`, which overrode the browser's default hidden behavior. As a result, the Resize dialog and backdrop appeared immediately on page load.

This fix adds a global `[hidden]{display:none!important}` rule to the component stylesheet. The dialog remains hidden until the Resize action explicitly sets `hidden = false`.
