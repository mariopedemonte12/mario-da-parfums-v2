import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FragrancesService } from '../fragrances/fragrances.service.js';
import { VendorsService } from '../vendors/vendors.service.js';
import { ListingsService } from '../listings/listings.service.js';
import { registerCatalogTools } from './tools/register-catalog-tools.js';

const MCP_SERVER_NAME = 'mario-da-parfums-catalog';
const MCP_SERVER_VERSION = '1.0.0';

export interface McpConnection {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

// Builds one McpServer + transport pair per HTTP request. The transport is
// stateless (sessionIdGenerator: undefined — no session id, no SSE
// resume/terminate, per specs/backend-mcp-server.md's "Configuración"), so
// there is no server-side session to share across requests in the first
// place.
@Injectable()
export class McpServerFactory {
  constructor(
    private readonly fragrancesService: FragrancesService,
    private readonly vendorsService: VendorsService,
    private readonly listingsService: ListingsService,
  ) {}

  create(): McpConnection {
    const server = new McpServer({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });

    registerCatalogTools(server, {
      fragrancesService: this.fragrancesService,
      vendorsService: this.vendorsService,
      listingsService: this.listingsService,
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    return { server, transport };
  }
}
