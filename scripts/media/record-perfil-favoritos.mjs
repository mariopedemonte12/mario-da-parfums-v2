// docs/media/perfil-favoritos.gif (+ perfil.png): login -> search -> 3 favorites -> profile "Guardados" -> logout.
// Needs a throwaway user registered beforehand via POST /auths/register. Credentials are read from
// DEMO_EMAIL / DEMO_PASSWORD or from .media-run/demo-email + .media-run/demo-pass (git-ignored). Never printed.
// REHEARSE=1 runs without recording.
import { newSession, finish, toGif, extractFrames, clickHuman, typeHuman, sleep, FRONT, outDir } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';

const runDir = path.resolve(import.meta.dirname, '../../.media-run');
const read = (f) => fs.readFileSync(path.join(runDir, f), 'utf8').trim();
const EMAIL = process.env.DEMO_EMAIL || read('demo-email');
const PASSWORD = process.env.DEMO_PASSWORD || read('demo-pass');
const rehearse = !!process.env.REHEARSE;
const QUERY = process.env.QUERY || 'jean';

const tStart = Date.now();
const s = await newSession({ record: !rehearse });
const { page } = s;

// 1. login
await page.goto(FRONT + '/login');
const email = page.getByLabel('Correo');
const pass = page.getByLabel('Contraseña');
await email.waitFor();
await sleep(1200);
const t0 = Date.now();
await clickHuman(page, email);
await typeHuman(email, EMAIL);
await sleep(400);
await clickHuman(page, pass);
await typeHuman(pass, PASSWORD);
await sleep(700);
await clickHuman(page, page.getByRole('button', { name: 'Entrar' }));
await page.waitForURL(FRONT + '/', { timeout: 15000 });
await page.getByText('Salir').first().waitFor();
await sleep(1200);

// 2. catalog + search + 3 hearts
const nav = page.getByRole('link', { name: 'Perfumes', exact: true }).first();
if (await nav.isVisible().catch(() => false)) await clickHuman(page, nav);
else await page.goto(FRONT + '/fragrances');
await page.waitForURL(/\/fragrances/);
const box = page.getByPlaceholder('Buscar por nombre o marca');
await box.waitFor();
await page.locator('a[href^="/fragrances/"]').first().waitFor();
await sleep(1200);
await clickHuman(page, box);
await typeHuman(box, QUERY);
// Wait for the debounced search to settle: the first card must be a Gaultier and stay so.
await page.locator('a[href^="/fragrances/"]', { hasText: 'Gaultier' }).first().waitFor();
await sleep(1200);
const hearts = page.getByRole('button', { name: 'Guardar perfume' });
for (let i = 0; i < 3; i++) {
  await clickHuman(page, hearts.first()); // saved ones flip to "Quitar de guardados"
  await page.getByRole('button', { name: 'Quitar de guardados' }).nth(i).waitFor();
  await sleep(700);
}
await sleep(400);

// 3. profile
const prof = page.locator('a[href="/profile"]').first();
if (await prof.isVisible().catch(() => false)) await clickHuman(page, prof);
else await page.goto(FRONT + '/profile');
await page.waitForURL(/\/profile/);
await page.getByRole('heading', { name: 'Guardados' }).waitFor();
await page.getByRole('button', { name: 'Quitar de guardados' }).nth(2).waitFor();
await sleep(1900);
await page.mouse.move(640, 500, { steps: 10 });
if (!rehearse) await page.screenshot({ path: path.join(outDir, 'perfil.png') });
await page.getByRole('heading', { name: 'Guardados' }).scrollIntoViewIfNeeded();
await sleep(1900);

// 4. logout
await clickHuman(page, page.getByText('Salir').first());
await page.getByText('Entrar').first().waitFor();
await sleep(1200);
const dur = (Date.now() - t0) / 1000;
console.log('duration ~', dur.toFixed(1));
if (rehearse) {
  await finish(s);
  process.exit(0);
}

const webm = await finish(s);
const gif = path.join(outDir, 'perfil-favoritos.gif');
toGif(webm, gif, { fps: 11, width: 880, trimStart: (t0 - tStart) / 1000 });
console.log('frames', extractFrames(gif, dur - 0.3, 8));
