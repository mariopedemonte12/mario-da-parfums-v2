import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service.js';
import { VendorsController } from './vendors.controller.js';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
