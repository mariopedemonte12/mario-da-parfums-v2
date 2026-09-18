import { NotFoundException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerCatalogTools } from './register-catalog-tools.js';
import type { FragrancesService } from '../../fragrances/fragrances.service.js';
import type { VendorsService } from '../../vendors/vendors.service.js';
import type { ListingsService } from '../../listings/listings.service.js';

// Test design: see specs/backend-mcp-server.md (source of truth) +
// .claude/skills/testing/SKILL.md.
//
// These are unit tests: FragrancesService/VendorsService/ListingsService are
// mocked (the DB boundary), but the MCP dispatch itself (McpServer +
// zod input-schema validation + JSON-RPC framing) is real, wired to a real
// Client over InMemoryTransport. That's the only way to observe how a
// schema-invalid input (e.g. a non-UUID id) is actually reported — a
// CallToolResult with isError:true vs. a protocol-level JSON-RPC error — and
// that distinction is one of the spec's explicit error-handling rows.

function buildFragrance(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    name: 'Bleu de Chanel',
    brand: 'Chanel',
    concentration: 'Eau de Parfum',
    description: null,
    imageUrl: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildVendor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'Vendor X',
    websiteUrl: 'https://vendor-x.example.com',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    fragranceId: randomUUID(),
    vendorId: 1,
    sizeMl: 100,
    price: 50000,
    url: 'https://vendor-x.example.com/product',
    inStock: true,
    scrapedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

interface MockedServices {
  fragrancesService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  vendorsService: { findAll: ReturnType<typeof vi.fn> };
  listingsService: { findAll: ReturnType<typeof vi.fn> };
}

async function setup(): Promise<{
  client: Client;
  services: MockedServices;
}> {
  const services: MockedServices = {
    fragrancesService: { findAll: vi.fn(), findOne: vi.fn() },
    vendorsService: { findAll: vi.fn() },
    listingsService: { findAll: vi.fn() },
  };

  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerCatalogTools(server, {
    fragrancesService: services.fragrancesService as unknown as FragrancesService,
    vendorsService: services.vendorsService as unknown as VendorsService,
    listingsService: services.listingsService as unknown as ListingsService,
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, services };
}

function textOf(result: { content: Array<{ type: string; text?: string }> }) {
  const first = result.content[0];
  if (!first || first.type !== 'text' || first.text === undefined) {
    throw new Error('Expected a text content block');
  }
  return first.text;
}

function jsonOf(result: { content: Array<{ type: string; text?: string }> }) {
  return JSON.parse(textOf(result));
}

describe('registerCatalogTools (unit, mocked services, real MCP dispatch)', () => {
  let client: Client;
  let services: MockedServices;

  beforeEach(async () => {
    ({ client, services } = await setup());
  });

  // --- search_fragrances --------------------------------------------

  describe('search_fragrances', () => {
    it('forwards filters and returns the cursor-paginated result as-is', async () => {
      const page = {
        data: [buildFragrance()],
        nextCursor: null,
      };
      services.fragrancesService.findAll.mockResolvedValue(page);

      const result = await client.callTool({
        name: 'search_fragrances',
        arguments: { search: 'Chanel', concentration: 'EDP' },
      });

      expect(result.isError).toBeFalsy();
      expect(services.fragrancesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Chanel',
          concentration: 'EDP',
        }),
      );
      expect(jsonOf(result as any)).toEqual(
        JSON.parse(JSON.stringify(page)),
      );
    });

    it('defaults to no cursor (first page) when omitted', async () => {
      services.fragrancesService.findAll.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      await client.callTool({ name: 'search_fragrances', arguments: {} });

      expect(services.fragrancesService.findAll).toHaveBeenCalledWith(
        expect.not.objectContaining({ cursor: expect.anything() }),
      );
    });

    it('forwards an explicit cursor', async () => {
      const cursor = randomUUID();
      services.fragrancesService.findAll.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      await client.callTool({
        name: 'search_fragrances',
        arguments: { cursor },
      });

      expect(services.fragrancesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ cursor }),
      );
    });

    // BVA on the zod input schema itself (cursor: uuid; limit: min 1, max 100).
    // A schema-invalid call resolves as a normal CallToolResult with
    // isError:true (the MCP SDK's own callTool handler wraps the schema
    // validation McpError via createToolError) — it never rejects the
    // client promise or crashes the connection.
    it.each([
      ['cursor', randomUUID(), true],
      ['cursor', 'not-a-uuid', false],
      ['limit', 1, true],
      ['limit', 0, false],
      ['limit', 100, true],
      ['limit', 101, false],
    ])('boundary: %s=%s accepted=%s', async (field, value, accepted) => {
      services.fragrancesService.findAll.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      const result = await client.callTool({
        name: 'search_fragrances',
        arguments: { [field]: value },
      });

      if (accepted) {
        expect(result.isError).toBeFalsy();
      } else {
        expect(result.isError).toBe(true);
      }
      if (!accepted) {
        expect(services.fragrancesService.findAll).not.toHaveBeenCalled();
      }
    });

    it('returns an error result (not a throw) when the service rejects', async () => {
      services.fragrancesService.findAll.mockRejectedValue(
        new Error('db down'),
      );

      const result = await client.callTool({
        name: 'search_fragrances',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(textOf(result as any)).toMatch(/failed to search fragrances/i);

      // The connection must survive a tool-level failure.
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain('search_fragrances');
    });
  });

  // --- get_fragrance --------------------------------------------------

  describe('get_fragrance', () => {
    it('returns the fragrance for an existing id', async () => {
      const fragrance = buildFragrance();
      services.fragrancesService.findOne.mockResolvedValue(fragrance);

      const result = await client.callTool({
        name: 'get_fragrance',
        arguments: { id: fragrance.id },
      });

      expect(result.isError).toBeFalsy();
      expect(jsonOf(result as any)).toEqual(
        JSON.parse(JSON.stringify(fragrance)),
      );
    });

    it('returns isError:true (not a thrown/protocol exception) for a non-existent id', async () => {
      const missingId = randomUUID();
      services.fragrancesService.findOne.mockRejectedValue(
        new NotFoundException(`Fragrance ${missingId} not found`),
      );

      const result = await client.callTool({
        name: 'get_fragrance',
        arguments: { id: missingId },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result as any)).toContain(missingId);

      // Spec: this must not crash the MCP connection.
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    });

    it('maps a non-NotFoundException service failure to the generic error message', async () => {
      services.fragrancesService.findOne.mockRejectedValue(
        new Error('connection terminated unexpectedly'),
      );

      const result = await client.callTool({
        name: 'get_fragrance',
        arguments: { id: randomUUID() },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result as any)).toMatch(/failed to get fragrance/i);
    });

    it('reports a non-UUID id as a validation error result, not a service call', async () => {
      const result = await client.callTool({
        name: 'get_fragrance',
        arguments: { id: 'not-a-uuid' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result as any)).toMatch(/invalid arguments for tool get_fragrance/i);
      expect(services.fragrancesService.findOne).not.toHaveBeenCalled();

      // Connection must still be alive after a validation failure.
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain('get_fragrance');
    });
  });

  // --- list_vendors -----------------------------------------------------

  describe('list_vendors', () => {
    it('maps vendors to their public summary and forwards pagination', async () => {
      const vendor = buildVendor();
      services.vendorsService.findAll.mockResolvedValue({
        data: [vendor],
        total: 1,
      });

      const result = await client.callTool({
        name: 'list_vendors',
        arguments: { name: 'Vendor', page: 2, limit: 10 },
      });

      expect(result.isError).toBeFalsy();
      expect(services.vendorsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Vendor', page: 2, limit: 10 }),
      );
      expect(jsonOf(result as any)).toEqual({
        data: [{ id: vendor.id, name: vendor.name, websiteUrl: vendor.websiteUrl }],
        total: 1,
        page: 2,
        limit: 10,
      });
      // createdAt/updatedAt must not leak through the summary mapping.
      expect(jsonOf(result as any).data[0]).not.toHaveProperty('createdAt');
    });

    it.each([
      ['page', 0, false],
      ['limit', 101, false],
      ['limit', 100, true],
    ])('boundary: %s=%d accepted=%s', async (field, value, accepted) => {
      services.vendorsService.findAll.mockResolvedValue({ data: [], total: 0 });

      const result = await client.callTool({
        name: 'list_vendors',
        arguments: { [field]: value },
      });

      if (accepted) {
        expect(result.isError).toBeFalsy();
      } else {
        expect(result.isError).toBe(true);
      }
    });

    it('returns an error result when the service rejects', async () => {
      services.vendorsService.findAll.mockRejectedValue(new Error('db down'));

      const result = await client.callTool({
        name: 'list_vendors',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(textOf(result as any)).toMatch(/failed to list vendors/i);
    });
  });

  // --- get_listings_for_fragrance ---------------------------------------

  describe('get_listings_for_fragrance', () => {
    const fragranceId = randomUUID();

    it('maps listings to their public summary', async () => {
      const listing = buildListing({ fragranceId });
      services.listingsService.findAll.mockResolvedValue({
        data: [listing],
        total: 1,
      });

      const result = await client.callTool({
        name: 'get_listings_for_fragrance',
        arguments: { fragranceId },
      });

      expect(result.isError).toBeFalsy();
      expect(jsonOf(result as any)).toEqual([
        {
          id: listing.id,
          fragranceId: listing.fragranceId,
          vendorId: listing.vendorId,
          sizeMl: listing.sizeMl,
          price: listing.price,
          url: listing.url,
          isAvailable: true,
        },
      ]);
    });

    // Decision table: inStock / minPrice / maxPrice each present or absent —
    // 3 independent boolean conditions => full 2^3 combinatorial coverage.
    it.each([
      [undefined, undefined, undefined],
      [true, undefined, undefined],
      [false, undefined, undefined],
      [undefined, 1000, undefined],
      [undefined, undefined, 5000],
      [true, 1000, undefined],
      [true, undefined, 5000],
      [true, 1000, 5000],
    ])(
      'forwards inStock=%s minPrice=%s maxPrice=%s to the service unchanged',
      async (inStock, minPrice, maxPrice) => {
        services.listingsService.findAll.mockResolvedValue({
          data: [],
          total: 0,
        });

        const args: Record<string, unknown> = { fragranceId };
        if (inStock !== undefined) args.inStock = inStock;
        if (minPrice !== undefined) args.minPrice = minPrice;
        if (maxPrice !== undefined) args.maxPrice = maxPrice;

        await client.callTool({
          name: 'get_listings_for_fragrance',
          arguments: args,
        });

        const expected: Record<string, unknown> = { fragranceId };
        if (inStock !== undefined) expected.inStock = inStock;
        if (minPrice !== undefined) expected.minPrice = minPrice;
        if (maxPrice !== undefined) expected.maxPrice = maxPrice;

        expect(services.listingsService.findAll).toHaveBeenCalledWith(
          expect.objectContaining(expected),
        );
      },
    );

    // BVA: minPrice/maxPrice >= 0.
    it.each([
      ['minPrice', 0, true],
      ['minPrice', -1, false],
      ['maxPrice', 0, true],
      ['maxPrice', -1, false],
    ])('boundary: %s=%d accepted=%s', async (field, value, accepted) => {
      services.listingsService.findAll.mockResolvedValue({
        data: [],
        total: 0,
      });

      const result = await client.callTool({
        name: 'get_listings_for_fragrance',
        arguments: { fragranceId, [field]: value },
      });

      if (accepted) {
        expect(result.isError).toBeFalsy();
      } else {
        expect(result.isError).toBe(true);
      }
    });

    it('reports a non-UUID fragranceId as a validation error result', async () => {
      const result = await client.callTool({
        name: 'get_listings_for_fragrance',
        arguments: { fragranceId: '1234' },
      });

      expect(result.isError).toBe(true);
      expect(services.listingsService.findAll).not.toHaveBeenCalled();

      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    });

    // Security-hardening finding: this tool built its DTO with
    // Object.assign(new FindListingsDto(), args), skipping class-validator
    // entirely — so only the zod inputSchema's `z.string().uuid()` ran,
    // which accepts ANY RFC4122 UUID version. The DTO's own
    // @IsUUID('4') is stricter (version 4 only), same as the equivalent
    // REST query param goes through the global ValidationPipe. A
    // well-formed v1 UUID is the concrete case that tells them apart:
    // zod-valid, DTO-invalid. Proves validateDtoInput() now runs the DTO's
    // rules on MCP input, not just the (looser) wire schema.
    it('rejects a well-formed non-v4 UUID that only the DTO, not the zod schema, catches', async () => {
      const v1FragranceId = 'f47ac10b-58cc-1372-8567-0e02b2c3d479';

      const result = await client.callTool({
        name: 'get_listings_for_fragrance',
        arguments: { fragranceId: v1FragranceId },
      });

      expect(result.isError).toBe(true);
      expect(services.listingsService.findAll).not.toHaveBeenCalled();
    });

    it('returns an error result when the service rejects', async () => {
      services.listingsService.findAll.mockRejectedValue(new Error('down'));

      const result = await client.callTool({
        name: 'get_listings_for_fragrance',
        arguments: { fragranceId },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result as any)).toMatch(
        /failed to get listings for fragrance/i,
      );
    });
  });

  // --- get_cheapest_listing ---------------------------------------------

  describe('get_cheapest_listing', () => {
    const fragranceId = randomUUID();

    it('returns an explicit null (not an error) when no listing is available', async () => {
      services.listingsService.findAll.mockResolvedValue({
        data: [],
        total: 0,
      });

      const result = await client.callTool({
        name: 'get_cheapest_listing',
        arguments: { fragranceId },
      });

      expect(result.isError).toBeFalsy();
      expect(jsonOf(result as any)).toBeNull();
    });

    it('always queries with inStock:true and the scan-limit, regardless of input', async () => {
      services.listingsService.findAll.mockResolvedValue({
        data: [],
        total: 0,
      });

      await client.callTool({
        name: 'get_cheapest_listing',
        arguments: { fragranceId },
      });

      expect(services.listingsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ fragranceId, inStock: true, limit: 100 }),
      );
    });

    it('picks the cheapest of several in-stock listings at different prices, regardless of order', async () => {
      const cheap = buildListing({ id: 1, fragranceId, price: 30000 });
      const mid = buildListing({ id: 2, fragranceId, price: 50000 });
      const expensive = buildListing({ id: 3, fragranceId, price: 90000 });
      // The cheapest item must be neither first nor last: a mutant that
      // always keeps the first item (dropping the comparison to a no-op
      // after the initial null-best case) would survive if the cheapest
      // were first, and a mutant that always overwrites `best` with the
      // current item (dropping the comparison entirely) would survive if
      // the cheapest were last. Middle position kills both.
      services.listingsService.findAll.mockResolvedValue({
        data: [expensive, cheap, mid],
        total: 3,
      });

      const result = await client.callTool({
        name: 'get_cheapest_listing',
        arguments: { fragranceId },
      });

      expect(jsonOf(result as any)).toMatchObject({ id: 1, price: 30000 });
    });

    it('picks the first listing on a price tie (strict less-than, not less-or-equal)', async () => {
      const first = buildListing({ id: 1, fragranceId, price: 30000 });
      const secondSamePrice = buildListing({ id: 2, fragranceId, price: 30000 });
      services.listingsService.findAll.mockResolvedValue({
        data: [first, secondSamePrice],
        total: 2,
      });

      const result = await client.callTool({
        name: 'get_cheapest_listing',
        arguments: { fragranceId },
      });

      expect(jsonOf(result as any)).toMatchObject({ id: 1 });
    });

    it('reports a non-UUID fragranceId as a validation error result', async () => {
      const result = await client.callTool({
        name: 'get_cheapest_listing',
        arguments: { fragranceId: 'nope' },
      });

      expect(result.isError).toBe(true);
      expect(services.listingsService.findAll).not.toHaveBeenCalled();
    });

    it('returns an error result when the service rejects', async () => {
      services.listingsService.findAll.mockRejectedValue(new Error('down'));

      const result = await client.callTool({
        name: 'get_cheapest_listing',
        arguments: { fragranceId },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result as any)).toMatch(/failed to get cheapest listing/i);
    });
  });

  // --- tools/list -------------------------------------------------------

  it('lists exactly the 5 read-only catalog tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'get_cheapest_listing',
        'get_fragrance',
        'get_listings_for_fragrance',
        'list_vendors',
        'search_fragrances',
      ].sort(),
    );
  });

  // Each tool's title/description is what an LLM caller sees to decide
  // whether/how to invoke it — locking down non-empty, specific text
  // guards against it silently regressing to a blank/useless string.
  it('gives every tool a non-empty, specific title and description', async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    expect(byName.search_fragrances).toMatchObject({
      title: 'Search fragrances',
      description: expect.stringContaining('Search the fragrance catalog'),
      inputSchema: {
        properties: {
          search: { description: expect.stringContaining('name OR brand') },
          concentration: { description: 'Exact concentration match' },
        },
      },
    });
    expect(byName.get_fragrance).toMatchObject({
      title: 'Get fragrance by id',
      description: expect.stringContaining('Get a single fragrance'),
      inputSchema: {
        properties: { id: { description: 'Fragrance id' } },
      },
    });
    expect(byName.list_vendors).toMatchObject({
      title: 'List vendors',
      description: expect.stringContaining('List vendors'),
      inputSchema: {
        properties: {
          name: {
            description: 'Partial, case-insensitive match on vendor name',
          },
        },
      },
    });
    expect(byName.get_listings_for_fragrance).toMatchObject({
      title: 'Get listings for a fragrance',
      description: expect.stringContaining('Get vendor listings'),
    });
    expect(byName.get_cheapest_listing).toMatchObject({
      title: 'Get cheapest available listing for a fragrance',
      description: expect.stringContaining('Find the cheapest in-stock'),
    });
  });
});
