import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appendFileSync } from 'node:fs';
const obs = (...a: unknown[]) => appendFileSync(process.env.QA_OBS_FILE ?? '/dev/null', a.join(' ') + '\n');
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Independent QA suite for specs/text-search-partial.md (GET /fragrances?search=).
// Black box: expected results come from a JS oracle that applies rules 1-6 of
// the spec (trim, split on whitespace, every token is a case-insensitive
// substring of name OR brand) over the seeded rows, never from the service.
// Runs against real Postgres (QA_DATABASE_URL / DATABASE_URL). Every seeded
// row carries description = QA_MARK so cleanup is exact.
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { DRIZZLE } = await import('../src/database/database.module.js');
const { fragrances } =
  await import('../src/database/schema/fragrance.schema.js');

const QA_MARK = 'QA-SEARCH-SEED';

type Seed = {
  name: string;
  brand: string;
  concentration?: string;
  olfactoryFamily?: string;
  targetAudience?: string;
  longevity?: string;
};

const CASE_SEEDS: Seed[] = [
  { name: 'Bleu de Chanel', brand: 'Chanel', concentration: 'EDP', olfactoryFamily: 'Woody', targetAudience: 'Men', longevity: 'Long' },
  { name: 'Chanel No 5', brand: 'Chanel', concentration: 'EDP', olfactoryFamily: 'Floral', targetAudience: 'Women', longevity: 'Long' },
  { name: 'Coco Mademoiselle', brand: 'Chanel', concentration: 'EDT', olfactoryFamily: 'Floral', targetAudience: 'Women', longevity: 'Moderate' },
  { name: 'Le Male', brand: 'Jean Paul Gaultier', concentration: 'EDT', olfactoryFamily: 'Oriental', targetAudience: 'Men', longevity: 'Long' },
  { name: 'Ultra Male', brand: 'Jean Paul Gaultier', concentration: 'EDT', olfactoryFamily: 'Fresh', targetAudience: 'Men', longevity: 'Moderate' },
  { name: 'Sauvage', brand: 'Dior', concentration: 'EDT', olfactoryFamily: 'Fresh', targetAudience: 'Men', longevity: 'Long' },
  { name: 'Sauvage Elixir', brand: 'Dior', concentration: 'Parfum', olfactoryFamily: 'Woody', targetAudience: 'Men', longevity: 'Long' },
  { name: 'Dior Homme', brand: 'Dior', concentration: 'EDT' },
  { name: 'Jean', brand: 'Other House' },
  { name: 'Gaultier Homage', brand: 'Homage House' },
  { name: 'Chanél Accent', brand: 'Acento' },
  { name: 'Piña Colada', brand: 'Ñandú Parfums' },
  { name: 'PIÑA Fuerte', brand: 'Otra' },
  { name: '50% Off Essence', brand: 'PctBrand' },
  { name: '50 Cents', brand: 'PctBrand' },
  { name: '5000 Tonnes', brand: 'PctBrand' },
  { name: 'Him_self', brand: 'UnderBrand' },
  { name: 'HimXself', brand: 'UnderBrand' },
  { name: 'Back\\slash', brand: 'SlashBrand' },
  { name: 'Backslash', brand: 'SlashBrand' },
  { name: "'; DROP TABLE fragrances;--", brand: 'SQLi "Brand"' },
  { name: 'a', brand: 'b' },
  { name: 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta', brand: 'Greek' },
  {
    name: 'Une Très Longue Fragrance Avec Beaucoup De Mots Dans Son Nom Complet Et Encore Plus De Mots Pour Dépasser Cent Caractères',
    brand: 'LongBrand',
  },
];

// 45 rows for pagination sweeps; concentration alternates.
const PAGI_SEEDS: Seed[] = Array.from({ length: 45 }, (_, i) => ({
  name: `Pagi Item ${String(i).padStart(2, '0')}`,
  brand: 'PagBrand',
  concentration: i % 3 === 0 ? 'EDP' : 'EDT',
  longevity: i % 2 === 0 ? 'Long' : 'Short',
}));

describe('QA text-search-partial (real Postgres)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let db: any;
  let rows: Array<Seed & { id: string }> = [];

  const oracle = (search: string | undefined, filters: Partial<Seed> = {}) => {
    const tokens = (search ?? '').trim().split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
    return rows
      .filter((r) => tokens.every((t) => r.name.toLowerCase().includes(t) || r.brand.toLowerCase().includes(t)))
      .filter((r) => Object.entries(filters).every(([k, v]) => (r as any)[k] === v))
      .map((r) => r.id)
      .sort();
  };

  const get = (q: Record<string, unknown>) => request(app.getHttpServer()).get('/fragrances').query(q);
  const ids = (res: request.Response) => res.body.data.map((d: { id: string }) => d.id);
  const names = (res: request.Response) => res.body.data.map((d: { name: string }) => d.name);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    const { customValidationPipe } = await import('../src/pipes/custom-validation.pipe.js');
    const { AllExceptionsFilter } = await import('../src/common/filters/http-exception.filter.js');
    app.useGlobalPipes(customValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    db = app.get(DRIZZLE);
    await db.delete(fragrances).where(eq(fragrances.description, QA_MARK));
    rows = await db
      .insert(fragrances)
      .values([...CASE_SEEDS, ...PAGI_SEEDS].map((s) => ({ ...s, description: QA_MARK })))
      .returning();
  });

  afterAll(async () => {
    await db.delete(fragrances).where(eq(fragrances.description, QA_MARK));
    await app.close();
  });

  // ---- spec "Ejemplos" ----------------------------------------------------
  describe('spec examples', () => {
    it('jean -> Jean Paul Gaultier rows (by brand) (+ name "Jean")', async () => {
      const res = await get({ search: 'jean', limit: 100 }).expect(200);
      expect(names(res)).toEqual(expect.arrayContaining(['Le Male', 'Ultra Male', 'Jean']));
      expect(ids(res)).toEqual(oracle('jean'));
    });
    it('gaultier -> Jean Paul Gaultier rows', async () => {
      const res = await get({ search: 'gaultier', limit: 100 }).expect(200);
      expect(names(res)).toEqual(expect.arrayContaining(['Le Male', 'Ultra Male']));
      expect(ids(res)).toEqual(oracle('gaultier'));
    });
    it('bleu -> Bleu de Chanel (by name)', async () => {
      const res = await get({ search: 'bleu' }).expect(200);
      expect(names(res)).toEqual(['Bleu de Chanel']);
    });
    it('full name "Bleu de Chanel"', async () => {
      const res = await get({ search: 'Bleu de Chanel' }).expect(200);
      expect(names(res)).toEqual(['Bleu de Chanel']);
    });
    it.each(['BLEU', 'bleu', 'BlEu'])('case-insensitive: %s', async (q) => {
      const res = await get({ search: q }).expect(200);
      expect(names(res)).toEqual(['Bleu de Chanel']);
    });
    it('dior sauvage == sauvage dior (Sauvage de Dior)', async () => {
      const a = await get({ search: 'dior sauvage', limit: 100 }).expect(200);
      const b = await get({ search: 'sauvage dior', limit: 100 }).expect(200);
      expect(ids(a)).toEqual(ids(b));
      expect(names(a).sort()).toEqual(['Sauvage', 'Sauvage Elixir']);
    });
    it('chanel bleu -> Bleu de Chanel (brand token + name token)', async () => {
      const res = await get({ search: 'chanel bleu' }).expect(200);
      expect(names(res)).toEqual(['Bleu de Chanel']);
    });
    it('zzzz -> empty, nextCursor null, 200', async () => {
      const res = await get({ search: 'zzzz' }).expect(200);
      expect(res.body).toEqual({ data: [], nextCursor: null });
    });
  });

  // ---- rules 1,4,6 tokenization ------------------------------------------
  describe('tokenization', () => {
    it.each([
      ['  bleu  ', 'leading/trailing spaces'],
      ['chanel      bleu', 'multiple inner spaces'],
      ['chanel\tbleu', 'tab separator'],
      ['chanel\nbleu', 'newline separator'],
      ['chanel bleu bleu bleu', 'duplicate tokens'],
      ['bleu chanel bleu', 'duplicate non-adjacent'],
    ])('%j (%s) equals oracle', async (q) => {
      const res = await get({ search: q, limit: 100 }).expect(200);
      expect(ids(res)).toEqual(oracle(q));
      expect(res.body.data.length).toBeGreaterThan(0);
    });
    it.each(['', ' ', '     ', '\t', '\n'])('blank %j == no filter', async (q) => {
      const withBlank = await get({ search: q, limit: 100 }).expect(200);
      const without = await get({ limit: 100 }).expect(200);
      expect(ids(withBlank)).toEqual(ids(without));
      expect(withBlank.body.nextCursor).toEqual(without.body.nextCursor);
    });
    it('non-breaking space treated as whitespace (JS \\s) - observation', async () => {
      const res = await get({ search: 'chanel bleu' });
      // Spec: "espacios en blanco". Record status; any of 200 w/ match is fine.
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) expect(names(res)).toEqual(['Bleu de Chanel']);
    });
  });

  // ---- rule 7 boundaries (two-point) --------------------------------------
  describe('limits (rule 7)', () => {
    it('5 tokens -> 200', async () => {
      await get({ search: 'alpha beta gamma delta epsilon' }).expect(200);
    });
    it('6 tokens -> 400', async () => {
      await get({ search: 'alpha beta gamma delta epsilon zeta' }).expect(400);
    });
    it('5 tokens with multiple spaces/trim -> 200', async () => {
      await get({ search: '  alpha   beta  gamma delta   epsilon  ' }).expect(200);
    });
    it('6 tokens, all duplicates -> 200 (deduped before counting, spec rule 7b)', async () => {
      await get({ search: 'a a a a a a' }).expect(200);
    });
    it('5 tokens + dupes-of-them (7 raw tokens, 5 unique) -> 200', async () => {
      await get({ search: 'a b c d e a b' }).expect(200);
    });
    it('6 distinct tokens with case-variant duplicates -> 400', async () => {
      await get({ search: 'a b c d e f A' }).expect(400);
    });
    it('6 tokens separated by tabs/newlines -> 400', async () => {
      await get({ search: 'a\tb\nc d\te\nf' }).expect(400);
    });
    it('exactly 100 chars (single token) -> 200', async () => {
      await get({ search: 'x'.repeat(100) }).expect(200);
    });
    it('101 chars (single token) -> 400', async () => {
      await get({ search: 'x'.repeat(101) }).expect(400);
    });
    it('100 chars in 5 tokens -> 200', async () => {
      const s = ['a'.repeat(19), 'b'.repeat(19), 'c'.repeat(19), 'd'.repeat(19), 'e'.repeat(20)].join(' ');
      expect(s.length).toBe(100 + 0 - 0); // 19*4+20 + 4 spaces = 100
      await get({ search: s }).expect(200);
    });
    it('101 chars in 5 tokens -> 400', async () => {
      const s = ['a'.repeat(19), 'b'.repeat(19), 'c'.repeat(19), 'd'.repeat(19), 'e'.repeat(21)].join(' ');
      expect(s.length).toBe(101);
      await get({ search: s }).expect(400);
    });
    it('100 real chars + trailing whitespace -> 200 (trim before length, spec rule 7a)', async () => {
      await get({ search: 'x'.repeat(100) + '   ' }).expect(200);
    });
    it('search given twice (array) -> 400 or handled, never 500', async () => {
      const res = await request(app.getHttpServer()).get('/fragrances?search=a&search=b');
      obs('QA-OBS array search status=', res.status);
      expect(res.status).toBeLessThan(500);
    });
    it('hostile 100-char regex-backtracking-ish input answers fast (<1s)', async () => {
      const t = Date.now();
      const res = await get({ search: ('a ' + ' ').repeat(33) + 'a' });
      expect(res.status).toBeLessThan(500);
      expect(Date.now() - t).toBeLessThan(1000);
    });
  });

  // ---- rule 5 wildcards ---------------------------------------------------
  describe('LIKE metacharacters literal', () => {
    it('50% matches only literal "50%" text', async () => {
      const res = await get({ search: '50%', limit: 100 }).expect(200);
      expect(names(res)).toEqual(['50% Off Essence']);
    });
    it('% alone matches only rows containing a literal %', async () => {
      const res = await get({ search: '%', limit: 100 }).expect(200);
      expect(names(res)).toEqual(['50% Off Essence']);
    });
    it('_ alone matches only rows containing a literal _', async () => {
      const res = await get({ search: '_', limit: 100 }).expect(200);
      expect(names(res)).toEqual(['Him_self']);
    });
    it('him_self does not match HimXself', async () => {
      const res = await get({ search: 'him_self' }).expect(200);
      expect(names(res)).toEqual(['Him_self']);
    });
    it('backslash alone matches only the row with literal \\', async () => {
      const res = await get({ search: '\\', limit: 100 }).expect(200);
      expect(names(res)).toEqual(['Back\\slash']);
    });
    it('back\\slash matches only Back\\slash, not Backslash', async () => {
      const res = await get({ search: 'back\\slash' }).expect(200);
      expect(names(res)).toEqual(['Back\\slash']);
    });
    it.each(['%%', '\\%', '\\\\', '%_', '_%_', '\\_', "'", '"', "';", '--', ';', '$1', '{}', '\\x00'.replace('x00', 'x')])('%j does not error and equals oracle', async (q) => {
      const res = await get({ search: q, limit: 100 });
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual(oracle(q));
    });
    it('SQL injection payload token finds only the literal row; table intact', async () => {
      const res = await get({ search: "'; DROP", limit: 100 }).expect(200);
      expect(names(res)).toEqual(["'; DROP TABLE fragrances;--"]);
      const after = await get({ limit: 1 }).expect(200);
      expect(after.body.data.length).toBe(1);
    });
    it('NUL byte in search -> 400 (spec rule 9), never 500', async () => {
      await request(app.getHttpServer()).get('/fragrances?search=a%00b').expect(400);
    });
    it.each(['concentration', 'olfactoryFamily', 'targetAudience', 'longevity'])(
      'NUL byte in %s -> 400',
      async (field) => {
        await request(app.getHttpServer()).get(`/fragrances?${field}=a%00b`).expect(400);
      },
    );
  });

  // ---- accents / unicode --------------------------------------------------
  describe('accents / unicode (no normalization per spec)', () => {
    it('chanél does NOT match Chanel rows; matches only accented row', async () => {
      const res = await get({ search: 'chanél', limit: 100 }).expect(200);
      expect(names(res)).toEqual(['Chanél Accent']);
    });
    it('chanel does NOT match Chanél Accent', async () => {
      const res = await get({ search: 'chanel', limit: 100 }).expect(200);
      expect(names(res)).not.toContain('Chanél Accent');
    });
    it('ñandú finds brand Ñandú Parfums (case-fold of Ñ)', async () => {
      const res = await get({ search: 'ñandú', limit: 100 }).expect(200);
      expect(names(res)).toEqual(['Piña Colada']);
    });
    it('PIÑA finds both Piña Colada and PIÑA Fuerte', async () => {
      const res = await get({ search: 'PIÑA', limit: 100 }).expect(200);
      expect(names(res).sort()).toEqual(['PIÑA Fuerte', 'Piña Colada']);
    });
    it('piña (lowercase) finds both (Ñ/ñ ILIKE folding)', async () => {
      const res = await get({ search: 'piña', limit: 100 }).expect(200);
      expect(names(res).sort()).toEqual(['PIÑA Fuerte', 'Piña Colada']);
    });
    it('pina (no tilde) does not match Piña', async () => {
      const res = await get({ search: 'pina', limit: 100 }).expect(200);
      expect(names(res)).toEqual([]);
    });
  });

  // ---- 1-char and long names ---------------------------------------------
  describe('short tokens and long names', () => {
    it('1-char token is valid and equals oracle', async () => {
      const res = await get({ search: 'a', limit: 100 }).expect(200);
      expect(ids(res)).toEqual(oracle('a').slice(0, 100));
    });
    it('token matching in name for one token and brand for another (a b)', async () => {
      const res = await get({ search: 'a b', limit: 100 }).expect(200);
      expect(names(res)).toContain('a');
      expect(ids(res)).toEqual(oracle('a b').slice(0, 100));
    });
    it('name with >5 words: truncated 5-token query still finds it', async () => {
      const res = await get({ search: 'Alpha Beta Gamma Delta Epsilon' }).expect(200);
      expect(names(res)).toEqual(['Alpha Beta Gamma Delta Epsilon Zeta Eta Theta']);
    });
    it('full >5 word name is a 400 (documented degradation)', async () => {
      await get({ search: 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta' }).expect(400);
    });
    it('name >100 chars: 100-char prefix (single-space words, <=5 tokens impossible) -> 400', async () => {
      const long = rows.find((r) => r.brand === 'LongBrand')!.name;
      expect(long.length).toBeGreaterThan(100);
      await get({ search: long.slice(0, 100) }).expect(400); // >5 tokens
    });
  });

  // ---- combination with exact filters ------------------------------------
  describe('combined with exact filters (AND)', () => {
    it.each([
      [{ search: 'chanel', concentration: 'EDP' }],
      [{ search: 'chanel', concentration: 'EDT' }],
      [{ search: 'chanel', olfactoryFamily: 'Floral' }],
      [{ search: 'chanel', targetAudience: 'Women' }],
      [{ search: 'chanel', longevity: 'Long' }],
      [{ search: 'chanel', longevity: 'Long', targetAudience: 'Women', olfactoryFamily: 'Floral', concentration: 'EDP' }],
      [{ search: 'dior', concentration: 'Nope' }],
      [{ search: 'male', targetAudience: 'Men' }],
      [{ search: 'zzzz', concentration: 'EDP' }],
    ] as Array<[Record<string, string>]>)('%j equals oracle', async (q) => {
      const { search, ...f } = q;
      const res = await get({ ...q, limit: 100 }).expect(200);
      expect(ids(res)).toEqual(oracle(search, f));
    });
    it('filter without search still works (concentration=Parfum)', async () => {
      const res = await get({ concentration: 'Parfum', limit: 100 }).expect(200);
      expect(names(res)).toEqual(['Sauvage Elixir']);
    });
    it('exact filters remain exact (concentration=ed is not a substring match)', async () => {
      const res = await get({ concentration: 'ed', limit: 100 }).expect(200);
      expect(names(res)).toEqual([]);
    });
  });

  // ---- pagination ---------------------------------------------------------
  describe('cursor/limit pagination', () => {
    async function sweep(q: Record<string, unknown>, limit: number) {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 100; i++) {
        const res = await get({ ...q, limit, ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...ids(res));
        expect(res.body.data.length).toBeLessThanOrEqual(limit);
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      return seen;
    }
    it.each([1, 7, 15, 44, 45, 46, 100])('search=pagbrand sweep limit=%i: no gaps/dupes, id asc', async (limit) => {
      const seen = await sweep({ search: 'pagbrand' }, limit);
      expect(seen).toEqual(oracle('pagbrand'));
      expect(new Set(seen).size).toBe(45);
    });
    it('sweep with search + concentration filter', async () => {
      const seen = await sweep({ search: 'pag item', concentration: 'EDP' }, 4);
      expect(seen).toEqual(oracle('pag item', { concentration: 'EDP' }));
      expect(seen.length).toBe(15);
    });
    it('sweep with multiple exact filters + search', async () => {
      const seen = await sweep({ search: 'PAGBRAND', concentration: 'EDP', longevity: 'Long' }, 3);
      expect(seen).toEqual(oracle('pagbrand', { concentration: 'EDP', longevity: 'Long' }));
    });
    it('limit=45 exactly-full page: nextCursor non-null then empty page ends', async () => {
      const p1 = await get({ search: 'pagbrand', limit: 45 }).expect(200);
      expect(p1.body.data.length).toBe(45);
      const p2 = await get({ search: 'pagbrand', limit: 45, cursor: p1.body.nextCursor }).expect(200);
      expect(p2.body).toEqual({ data: [], nextCursor: null });
    });
    it('limit=46 (> rows): nextCursor null', async () => {
      const p1 = await get({ search: 'pagbrand', limit: 46 }).expect(200);
      expect(p1.body.data.length).toBe(45);
      expect(p1.body.nextCursor).toBeNull();
    });
    it('cursor from search A applied to search B respects both (no rows <= cursor)', async () => {
      const p1 = await get({ search: 'pagbrand', limit: 10 }).expect(200);
      const p2 = await get({ search: 'chanel', cursor: p1.body.nextCursor, limit: 100 }).expect(200);
      expect(ids(p2).every((id: string) => id > p1.body.nextCursor)).toBe(true);
      expect(ids(p2)).toEqual(oracle('chanel').filter((id) => id > p1.body.nextCursor));
    });
    it('limit boundaries: 0 -> 400, 1 -> 200, 100 -> 200, 101 -> 400', async () => {
      await get({ search: 'chanel', limit: 0 }).expect(400);
      await get({ search: 'chanel', limit: 1 }).expect(200);
      await get({ search: 'chanel', limit: 100 }).expect(200);
      await get({ search: 'chanel', limit: 101 }).expect(400);
    });
    it('cursor non-uuid -> 400 with search', async () => {
      await get({ search: 'chanel', cursor: 'nope' }).expect(400);
    });
    it('default limit is 20 with search matching 45 rows', async () => {
      const res = await get({ search: 'pagbrand' }).expect(200);
      expect(res.body.data.length).toBe(20);
      expect(ids(res)).toEqual(oracle('pagbrand').slice(0, 20));
    });
  });

  // ---- legacy params ------------------------------------------------------
  describe('legacy name=/brand= are silently ignored', () => {
    it('name=zzzz alone -> 200 and same as no filter', async () => {
      const a = await get({ name: 'zzzz', limit: 100 }).expect(200);
      const b = await get({ limit: 100 }).expect(200);
      expect(ids(a)).toEqual(ids(b));
    });
    it('brand=Chanel alone -> 200 and same as no filter', async () => {
      const a = await get({ brand: 'Chanel', limit: 100 }).expect(200);
      const b = await get({ limit: 100 }).expect(200);
      expect(ids(a)).toEqual(ids(b));
    });
    it('search + legacy name/brand: only search applies', async () => {
      const res = await get({ search: 'bleu', name: 'zzzz', brand: 'Dior' }).expect(200);
      expect(names(res)).toEqual(['Bleu de Chanel']);
    });
  });

  // ---- MCP ---------------------------------------------------------------
  describe('MCP search_fragrances', () => {
    let client: Client;
    const call = async (args: Record<string, unknown>) => {
      const r: any = await client.callTool({ name: 'search_fragrances', arguments: args });
      return r;
    };
    beforeAll(async () => {
      client = new Client({ name: 'qa', version: '0.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    });
    afterAll(async () => {
      await client.close();
    });
    it('tool schema exposes search/concentration/cursor/limit and NOT name/brand', async () => {
      const tools = await client.listTools();
      const t: any = tools.tools.find((x) => x.name === 'search_fragrances');
      const props = Object.keys(t.inputSchema.properties).sort();
      expect(props).toEqual(['concentration', 'cursor', 'limit', 'search']);
    });
    it('jean finds Jean Paul Gaultier', async () => {
      const r = await call({ search: 'jean', limit: 100 });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content[0].text);
      expect(body.data.map((d: any) => d.id)).toEqual(oracle('jean'));
    });
    it('dior sauvage + concentration', async () => {
      const r = await call({ search: 'sauvage dior', concentration: 'Parfum' });
      const body = JSON.parse(r.content[0].text);
      expect(body.data.map((d: any) => d.name)).toEqual(['Sauvage Elixir']);
    });
    it('6 tokens -> tool error (not crash)', async () => {
      const r = await call({ search: 'a b c d e f' });
      expect(r.isError).toBe(true);
    });
    it('101 chars -> tool error', async () => {
      const r = await call({ search: 'x'.repeat(101) });
      expect(r.isError).toBe(true);
    });
    it('5 tokens ok, blank ok', async () => {
      expect((await call({ search: 'a b c d e' })).isError).toBeFalsy();
      expect((await call({ search: '   ' })).isError).toBeFalsy();
    });
    it('LIKE wildcard % literal over MCP', async () => {
      const r = await call({ search: '%' });
      const body = JSON.parse(r.content[0].text);
      expect(body.data.map((d: any) => d.name)).toEqual(['50% Off Essence']);
    });
    it('legacy name/brand args: ignored or rejected, never 500-style crash', async () => {
      const r = await call({ name: 'zzzz' });
      obs('QA-OBS MCP legacy name isError=', r.isError, String(r.content?.[0]?.text).slice(0, 80));
      expect(r).toBeDefined();
    });
    it('cursor pagination via MCP sweep matches oracle', async () => {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const r = await call({ search: 'pagbrand', limit: 8, ...(cursor ? { cursor } : {}) });
        const body = JSON.parse(r.content[0].text);
        seen.push(...body.data.map((d: any) => d.id));
        cursor = body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual(oracle('pagbrand'));
    });
  });
});
