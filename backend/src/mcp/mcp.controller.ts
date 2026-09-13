import {
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MCP_ROUTE } from './mcp.constants.js';
import { McpServerFactory } from './mcp-server.factory.js';

const METHOD_NOT_ALLOWED = {
  jsonrpc: '2.0' as const,
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
};

// Read-only MCP catalog server (fragrances/vendors/listings), mounted as a
// plain route on the same Nest process — no separate server to run/deploy.
// Public, unauthenticated, streamable-HTTP-only (stateless: no session id,
// so GET/DELETE — resume/terminate an existing session — have nothing to
// act on). See specs/backend-mcp-server.md.
@Controller(MCP_ROUTE)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpServerFactory: McpServerFactory) {}

  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { server, transport } = this.mcpServerFactory.create();

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  @Get()
  handleGet(@Res() res: Response): void {
    res.status(405).json(METHOD_NOT_ALLOWED);
  }

  @Delete()
  handleDelete(@Res() res: Response): void {
    res.status(405).json(METHOD_NOT_ALLOWED);
  }
}
