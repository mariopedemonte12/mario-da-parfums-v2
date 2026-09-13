// Stub MCP desechable — ver README.md de esta carpeta. Datos 100% fijos,
// solo para poder probar el loop de tool calling de chatbot-server sin
// depender del servidor MCP real (fuera de alcance de este spec).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const FAKE_FRAGRANCES = [
  { name: 'Bleu de Chanel', brand: 'Chanel' },
  { name: 'Sauvage', brand: 'Dior' },
  { name: 'Aventus', brand: 'Creed' },
];

const FAKE_LISTINGS: Record<
  string,
  { vendor: string; ml: number; price: number; isAvailable: boolean }[]
> = {
  'Bleu de Chanel': [
    { vendor: 'Perfumerías Unidas', ml: 100, price: 89990, isAvailable: true },
    { vendor: 'AromaChile', ml: 100, price: 92990, isAvailable: true },
  ],
  Sauvage: [
    { vendor: 'Perfumerías Unidas', ml: 100, price: 79990, isAvailable: false },
    { vendor: 'AromaChile', ml: 100, price: 81990, isAvailable: true },
  ],
  Aventus: [
    { vendor: 'AromaChile', ml: 100, price: 189990, isAvailable: true },
  ],
};

const server = new McpServer({ name: 'dev-mcp-stub', version: '0.0.1' });

server.registerTool(
  'search_fragrance',
  {
    title: 'Buscar fragancia',
    description: 'Busca fragancias en el catálogo (stub) por nombre o marca.',
    inputSchema: { query: z.string().describe('Nombre o marca a buscar') },
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const matches = FAKE_FRAGRANCES.filter(
      (f) =>
        f.name.toLowerCase().includes(q) || f.brand.toLowerCase().includes(q),
    );
    return { content: [{ type: 'text', text: JSON.stringify(matches) }] };
  },
);

server.registerTool(
  'get_listings',
  {
    title: 'Listar precios de una fragancia',
    description:
      'Devuelve los listings (vendor, ml, precio, disponibilidad) de una fragancia (stub).',
    inputSchema: { fragranceName: z.string() },
  },
  async ({ fragranceName }) => {
    const listings = FAKE_LISTINGS[fragranceName] ?? [];
    return { content: [{ type: 'text', text: JSON.stringify(listings) }] };
  },
);

server.registerTool(
  'find_cheapest_vendor',
  {
    title: 'Vendor más barato',
    description:
      'Devuelve el vendor disponible más barato para una fragancia (stub).',
    inputSchema: { fragranceName: z.string() },
  },
  async ({ fragranceName }) => {
    const listings = (FAKE_LISTINGS[fragranceName] ?? []).filter(
      (l) => l.isAvailable,
    );
    const cheapest = listings.sort((a, b) => a.price - b.price)[0];
    if (!cheapest) {
      return {
        content: [
          { type: 'text', text: 'Sin disponibilidad para esa fragancia.' },
        ],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(cheapest) }] };
  },
);

await server.connect(new StdioServerTransport());
