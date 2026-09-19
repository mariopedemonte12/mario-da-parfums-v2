// Shared helpers for the recording scripts. No credentials.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '../..');
const toolsDir = process.env.MEDIA_TOOLS || path.join(root, '.media-run/tools');
const require = createRequire(path.join(toolsDir, 'package.json'));
export const { chromium } = require('playwright-core');
export const ffmpeg = require('ffmpeg-static');
const _g = require('gifsicle');
export const gifsicle = _g.default ?? _g;
export const FRONT = process.env.FRONT_URL || 'http://localhost:3010';
export const API = process.env.API_URL || 'http://localhost:13000';
export const outDir = path.join(root, 'docs/media');
export const tmpDir = path.join(root, '.media-run/rec');
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById('__cur') || !document.body) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;left:0;top:0;transform:translate(' + (window.__cx||-100) + 'px,' + (window.__cy||-100) + 'px);';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.7 L9.6 12 L15.5 12 Z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    document.body.appendChild(c);
  };
  addEventListener('mousemove', (e) => { window.__cx = e.clientX; window.__cy = e.clientY; add(); const c = document.getElementById('__cur'); if (c) c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
  addEventListener('DOMContentLoaded', add);
  new MutationObserver(add).observe(document.documentElement, { childList: true, subtree: true });
})();`;

export async function newSession({ record = true } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'es-CL',
    ...(record ? { recordVideo: { dir: tmpDir, size: { width: 1280, height: 800 } } } : {}),
  });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

export async function moveTo(page, locator, { steps = 25 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  await sleep(350);
}
export async function clickHuman(page, locator) {
  await moveTo(page, locator);
  await locator.click();
}
export async function typeHuman(locator, text, delay = 80) {
  await locator.pressSequentially(text, { delay });
}

// Close the context (flushes the webm) and return the video path.
export async function finish({ browser, ctx, page }) {
  const video = page.video();
  await ctx.close();
  const p = video ? await video.path() : null;
  await browser.close();
  return p;
}

// webm -> optimized gif. trimStart (s) drops the page-load lead-in.
export function toGif(webm, gifPath, { fps = 11, width = 800, trimStart = 0, duration } = {}) {
  const pal = path.join(tmpDir, 'palette.png');
  const ss = ['-ss', String(trimStart)];
  const t = duration ? ['-t', String(duration)] : [];
  const vf = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  execFileSync(ffmpeg, ['-y', ...ss, ...t, '-i', webm, '-vf', `${vf},palettegen=max_colors=128:stats_mode=diff`, pal], { stdio: 'ignore' });
  const raw = gifPath + '.raw.gif';
  execFileSync(ffmpeg, ['-y', ...ss, ...t, '-i', webm, '-i', pal, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, raw], { stdio: 'ignore' });
  execFileSync(gifsicle, ['-O3', '--lossy=60', raw, '-o', gifPath]);
  fs.unlinkSync(raw);
  const mb = fs.statSync(gifPath).size / 1e6;
  console.log(`${path.basename(gifPath)}: ${mb.toFixed(2)} MB`);
  return mb;
}

// Extract n evenly spaced PNG frames from a gif for manual review.
export function extractFrames(gifPath, seconds, n = 6) {
  const dir = path.join(tmpDir, 'frames-' + path.basename(gifPath, '.gif'));
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(ffmpeg, ['-y', '-i', gifPath, '-vf', `fps=${n}/${seconds}`, path.join(dir, 'f%02d.png')], { stdio: 'ignore' });
  return dir;
}
