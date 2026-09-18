import { z } from 'zod';
import type { FunctionDeclaration } from '@google/genai';
import type { FragranceCard } from '../protocol.js';

export const PRESENT_FRAGRANCES_TOOL_NAME = 'present_fragrances';

// Not backed by any MCP server — see mcp-manager.ts, whose namespacing
// scheme (`<serverId>.<toolName>`) this literal, unprefixed name
// intentionally can never collide with, so chat-agent.ts can dispatch on the
// name alone without asking McpManager about it first.
const fragranceCardArgsSchema: z.ZodType<FragranceCard> = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string(),
  price: z.number().nullable(),
  imageUrl: z.string().nullable(),
});

export const presentFragrancesArgsSchema = z.object({
  items: z.array(fragranceCardArgsSchema).min(1).max(6),
});

/**
 * Lets the agent hand the widget structured data for the fragrances it's
 * about to talk about, so the frontend can render a catalog card + link
 * instead of the model describing them in plain prose. See
 * specs/chatbot-server.md, "Tarjetas de perfume estructuradas".
 *
 * Deliberately takes the full display fields, not just an id: the agent
 * already saw this exact data as the output of a catalog tool earlier in the
 * same turn (see AGENT_SYSTEM_PROMPT), so restating it here carries the same
 * trust requirement as the existing "never invent a price" rule — it doesn't
 * introduce a new source of truth. This also keeps chat-agent.ts from having
 * to hardcode which MCP server id serves fragrance data, which would break
 * the "no per-server-specific code" invariant mcp-manager.ts relies on.
 */
export const PRESENT_FRAGRANCES_TOOL: FunctionDeclaration = {
  name: PRESENT_FRAGRANCES_TOOL_NAME,
  description:
    'Present one or more specific fragrances from the catalog as visual cards in the chat UI, before writing the natural-language answer that refers to them. Only call this with data you already obtained from a catalog tool earlier in this same turn — never invented or guessed values.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description:
                'Fragrance id, exactly as returned by a catalog tool.',
            },
            name: { type: 'string' },
            brand: { type: 'string' },
            price: {
              type: ['number', 'null'],
              description:
                'Cheapest in-stock price in CLP, exactly as returned by a catalog tool, or null if unavailable/unknown — never a guessed number.',
            },
            imageUrl: { type: ['string', 'null'] },
          },
          required: ['id', 'name', 'brand', 'price', 'imageUrl'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};
