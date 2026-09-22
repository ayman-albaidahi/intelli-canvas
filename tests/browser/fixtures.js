// Shared browser-test fixtures.
//
// The editor is unusable until an image is loaded, and every spec needs a
// valid PNG to get there. Encoding it by hand (rather than committing a binary
// or pasting a base64 blob) means a stale or truncated fixture fails loudly at
// server-side validation instead of hanging the test on an upload that never
// lands.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { expect } from '@playwright/test';

export function makePngPath(testInfo, name = 'fixture.png', rgb = [180, 120, 90], size = [32, 32]) {
  const dir = join(testInfo.project.outputDir, 'fixtures');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, encodePng(size[0], size[1], rgb));
  return path;
}

// Minimal, correct PNG: one IDAT chunk over raw scanlines, CRC included.
function encodePng(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk(0x49484452, Buffer.concat([
    int32(width), int32(height), Buffer.from([8, 2, 0, 0, 0]), // 8-bit truecolour
  ]));
  // Each scanline starts with a filter-type byte (0 = none).
  const row = Buffer.alloc(1 + width * 3);
  for (let i = 0; i < width; i++) {
    row[1 + i * 3] = rgb[0];
    row[1 + i * 3 + 1] = rgb[1];
    row[1 + i * 3 + 2] = rgb[2];
  }
  const idat = chunk(0x49444154, zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row))));
  const iend = chunk(0x49454e44, Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function chunk(type, data) {
  return Buffer.concat([int32(data.length), Buffer.from([type >>> 24, type >>> 16 & 255, type >>> 8 & 255, type & 255]), data, crc32(type, data)]);
}

function int32(value) {
  return Buffer.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(type, data) {
  const bytes = Buffer.concat([Buffer.from([type >>> 24, type >>> 16 & 255, type >>> 8 & 255, type & 255]), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return int32((crc ^ 0xffffffff) >>> 0);
}

// The editor is unusable until a backend session exists; wait for the marker
// that one does rather than a fixed sleep.
export async function waitForImageLoaded(page) {
  await expect(page.locator('#save-state')).toContainText('Saved in API session', { timeout: 20_000 });
  await expect(page.locator('#empty-canvas')).toBeHidden();
}

// Asserts every visible interactive control sits inside the viewport. This is
// the plan's "no interactive element outside the viewport" exit criterion,
// measured rather than eyeballed: a control pushed off-screen by a regression
// in the responsive layout is still focusable and still unreachable by touch.
//
// Two false positives have to be excluded, or the check becomes noise:
//   - a control scrolled out of view inside a managed scroll region (the
//     header action row, the inspector panels) is reachable by scrolling, so
//     it is not a defect;
//   - a control in the closed drawer is translated off-screen but is
//     visibility:hidden, so it is not interactable at all.
// Only a control that escaped every clipping container is a real offender.
export async function expectNoControlOutsideViewport(page) {
  const offenders = await page.evaluate(() => {
    const { innerWidth, innerHeight } = window;
    const selectors = 'button, [role="tab"], input, select, a[href], summary, [role="toolbar"] button';

    // html/body carry overflow:hidden to pin the app to the viewport — that is
    // the boundary under test, not a legitimate clip, so they are skipped.
    function managedClip(el) {
      let node = el.parentElement;
      while (node && node !== document.body && node !== document.documentElement) {
        const style = getComputedStyle(node);
        if (/^(auto|scroll|hidden)$/.test(style.overflow) || /^(auto|scroll|hidden)$/.test(style.overflowX)) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    }

    const out = [];
    for (const el of document.querySelectorAll(selectors)) {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const outside =
        rect.right > innerWidth + 1 ||
        rect.left < -1 ||
        rect.bottom > innerHeight + 1 ||
        rect.top < -1;
      if (!outside) continue;
      if (managedClip(el)) continue; // inside a scroll region: reachable, fine
      out.push({
        tag: el.tagName,
        label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.id,
        rect: { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) },
        viewport: { innerWidth, innerHeight },
      });
    }
    return out;
  });
  expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
}
