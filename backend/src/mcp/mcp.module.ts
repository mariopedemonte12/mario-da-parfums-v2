import { Module } from '@nestjs/common';
import { FragrancesModule } from '../fragrances/fragrances.module.js';
import { VendorsModule } from '../vendors/vendors.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { McpController } from './mcp.controller.js';
import { McpServerFactory } from './mcp-server.factory.js';

@Module({
  imports: [FragrancesModule, VendorsModule, ListingsModule],
  controllers: [McpController],
  providers: [McpServerFactory],
})
export class McpModule {}
