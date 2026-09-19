// docs/media/busqueda-semantica.gif: home semantic search -> affinity results -> open one.
import { newSession, finish, toGif, extractFrames, clickHuman, typeHuman, sleep, FRONT, outDir } from './lib.mjs';
import path from 'node:path';

const tStart = Date.now();
const s = await newSession();
const { page } = s;
await page.goto(FRONT + '/');
const input = page.getByLabel('Describe lo que buscas');
await input.waitFor();
await sleep(1500);
const t0 = Date.now();

await clickHuman(page, input);
await typeHuman(input, 'perfumes frescos para verano');
await sleep(900);
await page.getByRole('button', { name: 'Buscar' }).click();
await page.getByText(/Afinidad \d+%/).first().waitFor({ timeout: 30000 });
await sleep(3500);

const link = page.locator('a[href^="/fragrances/"]').first();
await clickHuman(page, link);
await page.waitForURL(/\/fragrances\/[0-9a-f-]+/);
await page.locator('h1').first().waitFor();
await sleep(3000);
const dur = (Date.now() - t0) / 1000;

const webm = await finish(s);
const gif = path.join(outDir, 'busqueda-semantica.gif');
toGif(webm, gif, { fps: 11, width: 880, trimStart: (t0 - tStart) / 1000 });
console.log('duration ~', dur.toFixed(1));
console.log('frames', extractFrames(gif, dur - 0.3, 6));
