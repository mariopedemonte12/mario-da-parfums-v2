// docs/media/comparador.gif: search "jean" -> results -> detail -> price comparison.
import { newSession, finish, toGif, extractFrames, clickHuman, moveTo, typeHuman, sleep, FRONT, outDir } from './lib.mjs';
import path from 'node:path';

const tStart = Date.now();
const s = await newSession();
const { page } = s;
await page.goto(FRONT + '/fragrances');
await page.getByPlaceholder('Buscar por nombre o marca').waitFor();
await page.locator('a[href^="/fragrances/"]').first().waitFor();
await sleep(1500);
const t0 = Date.now();

const box = page.getByPlaceholder('Buscar por nombre o marca');
await clickHuman(page, box);
await typeHuman(box, 'jean');
await page.locator('a[href^="/fragrances/"]', { hasText: 'Jean Paul Gaultier' }).first().waitFor();
await sleep(400);
await page.waitForFunction(() => [...document.querySelectorAll('a[href^="/fragrances/"]')].every((a) => /Gaultier/i.test(a.textContent)), null, { timeout: 8000 }).catch(() => {});
await sleep(1800);

const card = page.locator('a[href^="/fragrances/"]').first();
await clickHuman(page, card);
await page.waitForURL(/\/fragrances\/[0-9a-f-]+/);
await page.locator('table').first().waitFor();
await page.locator('h1').first().waitFor();
await sleep(2500);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 40); await sleep(60); }
await sleep(3000);
const dur = (Date.now() - t0) / 1000;

const webm = await finish(s);
const gif = path.join(outDir, 'comparador.gif');
toGif(webm, gif, { fps: 11, width: 880, trimStart: (t0 - tStart) / 1000 });
console.log('duration ~', dur.toFixed(1));
console.log('frames', extractFrames(gif, dur - 0.3, 6));
