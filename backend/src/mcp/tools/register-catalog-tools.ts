import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FragrancesService } from '../../fragrances/fragrances.service.js';
import type { VendorsService } from '../../vendors/vendors.service.js';
import type { ListingsService } from '../../listings/listings.service.js';
import type { Listing } from '../../listings/entities/listing.entity.js';
import type { Vendor } from '../../vendors/entities/vendor.entity.js';
import { FindFragranceDto } from '../../fragrances/dto/find-fragrance.dto.js';
import { FindVendorsDto } from '../../vendors/dto/find-vendors.dto.js';
import { FindListingsDto } from '../../listings/dto/find-listings.dto.js';
import { jsonResult, errorResult } from './tool-result.js';
import { validateDtoInput } from './validate-dto-input.js';

// Every listing of one fragrance across all vendors, scanned to pick the
// cheapest in-stock one — the catalog has too few vendors per fragrance for
// the default page size (20) to ever miss one, but this keeps that true
// even if it grows, without adding a dedicated "no pagination" query path.
const CHEAPEST_LISTING_SCAN_LIMIT = 100;

interface CatalogServices {
  fragrancesService: FragrancesService;
  vendorsService: VendorsService;
  listingsService: ListingsService;
}

function toVendorSummary(vendor: Vendor) {
  return { id: vendor.id, name: vendor.name, websiteUrl: vendor.websiteUrl };
}

function toListingSummary(listing: Listing) {
  return {
    id: listing.id,
    fragranceId: listing.fragranceId,
    vendorId: listing.vendorId,
    sizeMl: listing.sizeMl,
    price: listing.price,
    url: listing.url,
    isAvailable: listing.inStock,
  };
}

// Read-only MCP tools over the fragrance catalog (fragrances/vendors/listings)
// for the chatbot — thin wrappers around the existing services, no new
// business logic beyond get_cheapest_listing's ordering. See
// specs/backend-mcp-server.md.
export function registerCatalogTools(
  server: McpServer,
  { fragrancesService, vendorsService, listingsService }: CatalogServices,
): void {
  server.registerTool(
    'search_fragrances',
    {
      title: 'Search fragrances',
      description:
        'Search the fragrance catalog by free text (name and/or brand) and/or concentration (paginated).',
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe(
            'Free text: whitespace-separated tokens (max 5, 100 chars), each matched partially and case-insensitively against name OR brand, any order',
          ),
        concentration: z
          .string()
          .optional()
          .describe('Exact concentration match'),
        cursor: z
          .string()
          .uuid()
          .optional()
          .describe('Keyset cursor: the id of the last item from the previous page'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => {
      const validated = await validateDtoInput(FindFragranceDto, args);
      if (!validated.ok) return validated.result;
      try {
        return jsonResult(await fragrancesService.findAll(validated.value));
      } catch {
        return errorResult('Failed to search fragrances');
      }
    },
  );

  server.registerTool(
    'get_fragrance',
    {
      title: 'Get fragrance by id',
      description: 'Get a single fragrance by its id.',
      inputSchema: { id: z.string().uuid().describe('Fragrance id') },
    },
    async ({ id }) => {
      try {
        return jsonResult(await fragrancesService.findOne(id));
      } catch (error) {
        if (error instanceof NotFoundException) {
          return errorResult(error.message);
        }
        return errorResult('Failed to get fragrance');
      }
    },
  );

  server.registerTool(
    'list_vendors',
    {
      title: 'List vendors',
      description: 'List vendors that sell fragrances (paginated).',
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe('Partial, case-insensitive match on vendor name'),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => {
      const validated = await validateDtoInput(FindVendorsDto, args);
      if (!validated.ok) return validated.result;
      const query = validated.value;
      try {
        const { data, total } = await vendorsService.findAll(query);
        return jsonResult({
          data: data.map(toVendorSummary),
          total,
          page: query.page,
          limit: query.limit,
        });
      } catch {
        return errorResult('Failed to list vendors');
      }
    },
  );

  server.registerTool(
    'get_listings_for_fragrance',
    {
      title: 'Get listings for a fragrance',
      description:
        'Get vendor listings (price, size, availability) for a fragrance — the basis for comparing prices across vendors.',
      inputSchema: {
        fragranceId: z.string().uuid(),
        inStock: z.boolean().optional(),
        minPrice: z.number().int().min(0).optional(),
        maxPrice: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      const validated = await validateDtoInput(FindListingsDto, args);
      if (!validated.ok) return validated.result;
      try {
        const { data } = await listingsService.findAll(validated.value);
        return jsonResult(data.map(toListingSummary));
      } catch {
        return errorResult('Failed to get listings for fragrance');
      }
    },
  );

  server.registerTool(
    'get_cheapest_listing',
    {
      title: 'Get cheapest available listing for a fragrance',
      description:
        'Find the cheapest in-stock listing for a fragrance across all vendors, or an explicit empty result if none is available.',
      inputSchema: { fragranceId: z.string().uuid() },
    },
    async ({ fragranceId }) => {
      try {
        const query = Object.assign(new FindListingsDto(), {
          fragranceId,
          inStock: true,
          limit: CHEAPEST_LISTING_SCAN_LIMIT,
        });
        const { data } = await listingsService.findAll(query);
        const cheapest = data.reduce<Listing | null>(
          (best, listing) =>
            !best || listing.price < best.price ? listing : best,
          null,
        );
        return jsonResult(cheapest ? toListingSummary(cheapest) : null);
      } catch {
        return errorResult('Failed to get cheapest listing');
      }
    },
  );
}
