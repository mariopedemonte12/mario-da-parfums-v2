// docs/media/hero.png (catalog) and docs/media/detalle.png (detail + price table), 1280x800.
import { newSession, FRONT, API, sleep, outDir } from './lib.mjs';
import path from 'node:path';

const s = await newSession({ record: false });
const { page } = s;
await page.goto(FRONT + '/fragrances');
await page.locator('a[href^="/fragrances/"]').first().waitFor();
await sleep(2500);
await page.screenshot({ path: path.join(outDir, 'hero.png') });

const res = await fetch(`${API}/fragrances?search=${encodeURIComponent('jean')}&limit=1`);
const id = (await res.json()).data[0].id;
await page.goto(`${FRONT}/fragrances/${id}`);
await page.locator('table').first().waitFor();
await sleep(2500);
await page.mouse.wheel(0, 120);
await sleep(1500);
await page.screenshot({ path: path.join(outDir, 'detalle.png') });
await s.browser.close();
