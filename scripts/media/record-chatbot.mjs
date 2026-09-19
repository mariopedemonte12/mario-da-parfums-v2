// docs/media/chatbot.gif: open the Sensei widget, ask for a cheaper Sauvage-like perfume, wait for streamed answer + cards.
// REHEARSE=1 runs without recording (no GIF) and logs the WebSocket protocol (types only, no secrets).
import { newSession, finish, toGif, extractFrames, clickHuman, typeHuman, sleep, FRONT, outDir } from './lib.mjs';
import path from 'node:path';

const QUESTION = process.env.QUESTION || 'Quiero un perfume parecido a Sauvage EDP de Dior pero más barato';
const rehearse = process.env.REHEARSE === '1';
const tStart = Date.now();
const s = await newSession({ record: !rehearse });
const { page } = s;
const wsTypes = [];
let done = false, errMsg = null, nCards = 0;
page.on('websocket', (ws) => {
  ws.on('framereceived', ({ payload }) => {
    try {
      const m = JSON.parse(String(payload));
      wsTypes.push(m.type);
      if (m.type === 'done') done = true;
      if (m.type === 'error') errMsg = JSON.stringify(m).slice(0, 400);
      if (m.type === 'fragrances') nCards = (m.items || m.fragrances || []).length;
      if (m.type === 'status') console.log('status:', JSON.stringify(m).slice(0, 200));
    } catch {}
  });
});

await page.goto(FRONT + '/');
await page.getByLabel('Describe lo que buscas').waitFor();
await sleep(1500);
const t0 = Date.now();

await clickHuman(page, page.getByRole('button', { name: /Sensei/i }).first());
const input = page.getByPlaceholder('Escribe al sensei…');
await input.waitFor();
await sleep(800);
await clickHuman(page, input);
await typeHuman(input, QUESTION, 80);
await sleep(700);
await page.keyboard.press('Enter');

const t1 = Date.now();
while (!done && !errMsg && Date.now() - t1 < 90000) await sleep(500);
console.log('done:', done, 'error:', errMsg, 'cards:', nCards);
console.log('ws types:', [...new Set(wsTypes)].join(','), 'tokens:', wsTypes.filter((t) => t === 'token').length);
if (errMsg || !done) { await finish(s); process.exit(1); }
await sleep(1200);
// Scroll the chat back up so the perfume cards are on screen for the closing pause.
const card = page.locator('[role=dialog] a[href^="/fragrances/"]').first();
await card.waitFor({ timeout: 5000 }).catch(() => console.log('WARN: no card link found'));
await card.scrollIntoViewIfNeeded().catch(() => {});
await sleep(2800);
const dur = (Date.now() - t0) / 1000;
const webm = await finish(s);
if (rehearse) { console.log('rehearsal ok, dur', dur.toFixed(1)); process.exit(0); }
const gif = path.join(outDir, 'chatbot.gif');
toGif(webm, gif, { fps: 11, width: 880, trimStart: (t0 - tStart) / 1000 });
console.log('duration ~', dur.toFixed(1));
console.log('frames', extractFrames(gif, dur - 0.3, 6));
