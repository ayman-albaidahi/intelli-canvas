import { describe, expect, it } from 'vitest';
import {
  INSPECTOR_CONTEXT_PRIORITY,
  INSPECTOR_CONTEXTS,
  deriveInspectorContext,
} from './inspector-context.js';

describe('deriveInspectorContext', () => {
  it('exposes the official contexts and priority order', () => {
    expect(INSPECTOR_CONTEXTS).toEqual([
      'empty', 'image', 'layer', 'brush', 'eraser', 'crop', 'processing', 'error',
    ]);
    expect(INSPECTOR_CONTEXT_PRIORITY).toEqual([
      'error', 'processing', 'crop', 'brush', 'eraser', 'layer', 'image', 'empty',
    ]);
  });

  it.each([
    [{ editorReady: false }, 'empty'],
    [{ editorReady: true, activeTool: 'select' }, 'image'],
    [{ editorReady: true, activeTool: 'select', selectedObjectId: 'layer-1' }, 'layer'],
    [{ editorReady: true, activeTool: 'brush' }, 'brush'],
    [{ editorReady: true, activeTool: 'eraser' }, 'eraser'],
    [{ editorReady: true, activeTool: 'crop' }, 'crop'],
  ])('resolves %j to %s', (state, expected) => {
    expect(deriveInspectorContext(state)).toBe(expected);
  });

  it('lets error override every other context', () => {
    expect(deriveInspectorContext({
      editorReady: true,
      activeTool: 'crop',
      selectedObjectId: 'layer-1',
      processing: { active: true },
      error: { code: 'FAILED', message: 'Operation failed' },
    })).toBe('error');
  });

  it('lets processing override crop, tools, layers, and image', () => {
    expect(deriveInspectorContext({
      editorReady: true,
      activeTool: 'crop',
      selectedObjectId: 'layer-1',
      processing: { active: true, operation: 'crop' },
    })).toBe('processing');
  });

  it('treats inactive error objects as no error', () => {
    expect(deriveInspectorContext({ editorReady: true, error: { active: false } })).toBe('image');
  });

  it('supports the legacy hasImage readiness field during migration', () => {
    expect(deriveInspectorContext({ hasImage: true, activeTool: 'select' })).toBe('image');
    expect(deriveInspectorContext({ hasImage: false, activeTool: 'select' })).toBe('empty');
  });
});
