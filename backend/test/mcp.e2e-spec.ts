import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Runs the MCP catalog server against a real Postgres (docker-compose.yml —
// container must already be up), over the real HTTP transport, per the
// testing skill's scope gate: the things that matter here (does the MCP
// endpoint really require no auth, same as the now-public REST endpoint,
// does a real DB outage produce an error result instead of crashing the
// connection/process, does get_cheapest_listing really pick the cheapest
// real row) only surface against the real stack — a mocked-service unit
// test (register-catalog-tools.spec.ts) can't exercise them. Defaults let
// this run without a committed .env; override via real env vars for CI.
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { DRIZZLE, PG_POOL } = await import('../src/database/database.module.js');
const { listings } = await import('../src/database/schema/listing.schema.js');
const { fragrances } =
  await import('../src/database/schema/fragrance.schema.js');
const { vendors } = await import('../src/database/schema/vendor.schema.js');

async function connectClient(baseUrl: string): Promise<Client> {
  const client = new Client({ name: 'e2e-test-client', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl));
  await client.connect(transport);
  return client;
}

function textOf(result: any): string {
  return result.content[0].text;
}

function jsonOf(result: any): unknown {
  return JSON.parse(textOf(result));
}

describe('MCP catalog server (e2e, real Postgres, real HTTP)', () => {
  let app: INestApplication<App>;
  let db: any;
  let client: Client;
  let baseUrl: string;

  let vendorA: { id: number; name: string };
  let fragranceA: { id: string; name: string };
  let fragranceEmpty: { id: string }; // no listings at all
  let fragranceOutOfStockOnly: { id: string };

  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const { customValidationPipe } =
      await import('../src/pipes/custom-validation.pipe.js');
    const { AllExceptionsFilter } =
      await import('../src/common/filters/http-exception.filter.js');
    app.useGlobalPipes(customValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();

    db = app.get(DRIZZLE);

    [vendorA] = await db
      .insert(vendors)
      .values({
        name: `MCP E2E Vendor ${suffix}`,
        websiteUrl: 'https://mcp-e2e-vendor.example.com',
      })
      .returning();

    [fragranceA] = await db
      .insert(fragrances)
      .values({
        name: `MCP E2E Fragrance ${suffix}`,
        brand: 'MCP E2E Brand',
        concentration: 'Eau de Parfum',
      })
      .returning();

    [fragranceEmpty] = await db
      .insert(fragrances)
      .values({
        name: `MCP E2E Fragrance Empty ${suffix}`,
        brand: 'MCP E2E Brand',
      })
      .returning();

    [fragranceOutOfStockOnly] = await db
      .insert(fragrances)
      .values({
        name: `MCP E2E Fragrance OOS ${suffix}`,
        brand: 'MCP E2E Brand',
      })
      .returning();

    await db.insert(listings).values([
      {
        fragranceId: fragranceA.id,
        vendorId: vendorA.id,
        sizeMl: 50,
        price: 90000,
        url: 'https://mcp-e2e-vendor.example.com/expensive',
        inStock: true,
      },
      {
        fragranceId: fragranceA.id,
        vendorId: vendorA.id,
        sizeMl: 100,
        price: 30000,
        url: 'https://mcp-e2e-vendor.example.com/cheap',
        inStock: true,
      },
      {
        fragranceId: fragranceA.id,
        vendorId: vendorA.id,
        sizeMl: 200,
        price: 10000,
        url: 'https://mcp-e2e-vendor.example.com/out-of-stock-but-cheapest',
        inStock: false,
      },
      {
        fragranceId: fragranceOutOfStockOnly.id,
        vendorId: vendorA.id,
        sizeMl: 100,
        price: 40000,
        url: 'https://mcp-e2e-vendor.example.com/only-oos',
        inStock: false,
      },
    ]);

    client = await connectClient(baseUrl);
  });

  afterAll(async () => {
    await client?.close();
    await db.delete(listings).where(eq(listings.vendorId, vendorA.id));
    await db.delete(fragrances).where(eq(fragrances.id, fragranceA.id));
    await db.delete(fragrances).where(eq(fragrances.id, fragranceEmpty.id));
    await db
      .delete(fragrances)
      .where(eq(fragrances.id, fragranceOutOfStockOnly.id));
    await db.delete(vendors).where(eq(vendors.id, vendorA.id));
    await app.close();
  });

  // --- transport-level: GET/DELETE, no session to resume/terminate ------

  it('GET /mcp returns 405 (no session to resume)', async () => {
    const res = await request(app.getHttpServer()).get('/mcp').expect(405);
    expect(res.body.error.message).toMatch(/method not allowed/i);
  });

  it('DELETE /mcp returns 405 (no session to terminate)', async () => {
    const res = await request(app.getHttpServer()).delete('/mcp').expect(405);
    expect(res.body.error.message).toMatch(/method not allowed/i);
  });

  // --- no authentication required, same as the equivalent REST route -----
  // (specs/fragrances-crud.md, "Alcance del CRUD": GET /fragrances is now
  // public, so this is no longer a MCP-vs-REST inconsistency to sanity
  // check — both are anonymous-accessible. Kept as a same-behavior smoke
  // test rather than deleted, so a future guard regression on either side
  // still surfaces here.)

  it('the equivalent REST route is also public, no token needed', async () => {
    await request(app.getHttpServer()).get('/fragrances').expect(200);
  });

  it('search_fragrances works over MCP with no Authorization header at all', async () => {
    const result = await client.callTool({
      name: 'search_fragrances',
      arguments: { search: fragranceA.name },
    });

    expect(result.isError).toBeFalsy();
    const body = jsonOf(result) as { data: Array<{ id: string }> };
    expect(body.data.map((f) => f.id)).toContain(fragranceA.id);
  });

  // --- search_fragrances / get_fragrance against real rows ---------------

  it('search_fragrances searches by brand text and filters by concentration against real rows', async () => {
    const result = await client.callTool({
      name: 'search_fragrances',
      arguments: { search: 'MCP E2E Brand', concentration: 'Eau de Parfum' },
    });

    const body = jsonOf(result) as { data: Array<{ id: string }> };
    const ids = body.data.map((f) => f.id);
    expect(ids).toContain(fragranceA.id);
    expect(ids).not.toContain(fragranceEmpty.id); // no concentration set
  });

  // specs/query-performance.md section 3: search_fragrances now takes
  // `cursor` (uuid) instead of `page`, matching the REST DTO change — end
  // to end over the real MCP transport, not just the zod schema shape.
  it('search_fragrances paginates via cursor end to end, with no duplicate or skipped rows', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const result = await client.callTool({
        name: 'search_fragrances',
        arguments: {
          search: 'MCP E2E Brand',
          limit: 1,
          ...(cursor ? { cursor } : {}),
        },
      });
      expect(result.isError).toBeFalsy();
      const body = jsonOf(result) as {
        data: Array<{ id: string }>;
        nextCursor: string | null;
      };
      // With limit=1, nextCursor is still set on the page that happens to
      // be the true last one (it came back exactly `limit` long) — the
      // empty page on the *following* call is what actually signals the
      // end, per the documented rule. So collect whatever this page has
      // and only stop once a page (usually empty) has no nextCursor.
      seen.push(...body.data.map((f) => f.id));
      cursor = body.nextCursor ?? undefined;
      if (!body.nextCursor) break;
    }

    expect(new Set(seen)).toEqual(
      new Set([fragranceA.id, fragranceEmpty.id, fragranceOutOfStockOnly.id]),
    );
    expect(seen).toHaveLength(3);
  });

  it('search_fragrances rejects a non-uuid cursor as a tool error, not a crash', async () => {
    const result = await client.callTool({
      name: 'search_fragrances',
      arguments: { cursor: 'not-a-uuid' },
    });

    expect(result.isError).toBe(true);
    const tools = await client.listTools();
    expect(tools.tools.length).toBe(5);
  });

  it('get_fragrance returns the real row for an existing id', async () => {
    const result = await client.callTool({
      name: 'get_fragrance',
      arguments: { id: fragranceA.id },
    });

    expect(result.isError).toBeFalsy();
    expect(jsonOf(result)).toMatchObject({
      id: fragranceA.id,
      name: fragranceA.name,
    });
  });

  it('get_fragrance returns isError:true (not a crash) for a well-formed but non-existent id', async () => {
    const result = await client.callTool({
      name: 'get_fragrance',
      arguments: { id: randomUUID() },
    });

    expect(result.isError).toBe(true);

    // Connection must still be usable for the next call.
    const tools = await client.listTools();
    expect(tools.tools.length).toBe(5);
  });

  // --- list_vendors --------------------------------------------------

  it('list_vendors finds the real inserted vendor by name', async () => {
    const result = await client.callTool({
      name: 'list_vendors',
      arguments: { name: vendorA.name },
    });

    const body = jsonOf(result) as { data: Array<{ id: number }> };
    expect(body.data.map((v) => v.id)).toContain(vendorA.id);
  });

  // --- get_listings_for_fragrance filters against real rows --------------

  it('get_listings_for_fragrance returns all real listings for the fragrance', async () => {
    const result = await client.callTool({
      name: 'get_listings_for_fragrance',
      arguments: { fragranceId: fragranceA.id },
    });

    const body = jsonOf(result) as Array<{ price: number }>;
    expect(body).toHaveLength(3);
  });

  it('get_listings_for_fragrance filters by inStock=true against real rows', async () => {
    const result = await client.callTool({
      name: 'get_listings_for_fragrance',
      arguments: { fragranceId: fragranceA.id, inStock: true },
    });

    const body = jsonOf(result) as Array<{
      price: number;
      isAvailable: boolean;
    }>;
    expect(body).toHaveLength(2);
    expect(body.every((l) => l.isAvailable)).toBe(true);
  });

  it('get_listings_for_fragrance filters by minPrice/maxPrice against real rows', async () => {
    const result = await client.callTool({
      name: 'get_listings_for_fragrance',
      arguments: {
        fragranceId: fragranceA.id,
        minPrice: 20000,
        maxPrice: 50000,
      },
    });

    const body = jsonOf(result) as Array<{ price: number }>;
    expect(body.map((l) => l.price)).toEqual([30000]);
  });

  // --- get_cheapest_listing against real rows -----------------------

  it('picks the cheapest in-stock real listing, ignoring a cheaper out-of-stock one', async () => {
    const result = await client.callTool({
      name: 'get_cheapest_listing',
      arguments: { fragranceId: fragranceA.id },
    });

    expect(result.isError).toBeFalsy();
    // 10000 is cheaper but out of stock; 30000 is the true cheapest in-stock.
    expect(jsonOf(result)).toMatchObject({ price: 30000 });
  });

  it('returns an explicit null (not an error) for a fragrance with zero listings', async () => {
    const result = await client.callTool({
      name: 'get_cheapest_listing',
      arguments: { fragranceId: fragranceEmpty.id },
    });

    expect(result.isError).toBeFalsy();
    expect(jsonOf(result)).toBeNull();
  });

  it('returns an explicit null (not an error) when every real listing is out of stock', async () => {
    const result = await client.callTool({
      name: 'get_cheapest_listing',
      arguments: { fragranceId: fragranceOutOfStockOnly.id },
    });

    expect(result.isError).toBeFalsy();
    expect(jsonOf(result)).toBeNull();
  });
});

describe('MCP catalog server (e2e) — DB outage resilience', () => {
  // Isolated app + pool, so ending the pool here doesn't break the suite
  // above. Spec: "Falla de conexión a la base de datos al ejecutar una
  // tool" must produce a tool error result, and "el proceso Nest sigue
  // vivo, no se cae el servidor MCP" — proven by the endpoint still
  // answering tools/list (no-DB) and a fresh POST /mcp call after the pool
  // is dead, all inside this same process (an uncaught crash here would
  // take the whole test run down with it).
  let app: INestApplication<App>;
  let baseUrl: string;
  let client: Client;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();

    client = await connectClient(baseUrl);
  });

  afterAll(async () => {
    await client?.close();
    // This suite deliberately ends the pg Pool mid-test (below) to simulate
    // a DB outage; app.close() would call DatabaseModule.onModuleDestroy,
    // which ends the same (already-ended) pool again and throws. Swallow
    // that specific teardown error — it's this test's own doing, not a
    // real double-close bug in the implementation.
    await app.close().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Called end on pool more than once')) throw error;
    });
  });

  it('a tool call fails gracefully after the DB pool is closed, and the MCP endpoint keeps responding', async () => {
    // Baseline: works before the outage.
    const before = await client.callTool({
      name: 'search_fragrances',
      arguments: {},
    });
    expect(before.isError).toBeFalsy();

    const pool = app.get(PG_POOL);
    await pool.end();

    const duringOutage = await client.callTool({
      name: 'search_fragrances',
      arguments: {},
    });
    expect(duringOutage.isError).toBe(true);

    // The connection/process must still be alive: tools/list doesn't touch
    // the DB and must keep answering.
    const tools = await client.listTools();
    expect(tools.tools.length).toBe(5);

    // And a brand-new POST /mcp request must also still be served (proves
    // the whole process, not just this one connection, survived).
    const freshClient = await connectClient(baseUrl);
    const freshTools = await freshClient.listTools();
    expect(freshTools.tools.length).toBe(5);
    await freshClient.close();
  });
});
