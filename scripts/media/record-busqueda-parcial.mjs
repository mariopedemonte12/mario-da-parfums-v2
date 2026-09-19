// docs/media/busqueda-parcial.gif (<=10 s): live partial text search on /fragrances.
import { newSession, finish, toGif, extractFrames, clickHuman, typeHuman, sleep, FRONT, outDir } from './lib.mjs';
import path from 'node:path';

const tStart = Date.now();
const s = await newSession();
const { page } = s;
await page.goto(FRONT + '/fragrances');
const box = page.getByPlaceholder('Buscar por nombre o marca');
await box.waitFor();
await page.locator('a[href^="/fragrances/"]').first().waitFor();
await sleep(1200);
const t0 = Date.now();

// Waits until every visible card mentions the expected text (results settled).
async function settled(re) {
  await page.waitForFunction(
    (src) => {
      const cards = [...document.querySelectorAll('a[href^="/fragrances/"]')];
      return cards.length > 0 && cards.every((a) => new RegExp(src, 'i').test(a.textContent));
    },
    re,
    { timeout: 10000 },
  );
  await sleep(1000);
}

await clickHuman(page, box);
await typeHuman(box, 'jean');
await settled('jean');
await box.fill('');
await sleep(500);
await typeHuman(box, 'gaultier');
await settled('gaultier');
await box.fill('');
await sleep(500);
await typeHuman(box, 'dior sauvage');
await settled('sauvage|dior');
await sleep(700);
const dur = (Date.now() - t0) / 1000;

const webm = await finish(s);
const gif = path.join(outDir, 'busqueda-parcial.gif');
toGif(webm, gif, { fps: 11, width: 880, trimStart: (t0 - tStart) / 1000 });
console.log('duration ~', dur.toFixed(1));
console.log('frames', extractFrames(gif, dur - 0.3, 6));
