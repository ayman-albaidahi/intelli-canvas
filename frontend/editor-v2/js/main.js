/**
 * Browser entry point. Everything the editor does lives in EditorApp;
 * this file exists because index.html names it as the module script and
 * a page needs one obvious place that says "the app starts here".
 */

import { EditorApp } from './app.js';

const app = new EditorApp();
await app.start();
// One handle on the instance for the console and future teardown paths:
// `window.intelliCanvasApp.destroy()` already works because destroy()
// unregisters everything this instance subscribed to.
window.intelliCanvasApp = app;
