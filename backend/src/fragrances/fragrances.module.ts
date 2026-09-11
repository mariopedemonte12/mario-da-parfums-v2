import { Module } from '@nestjs/common';
import { FragrancesService } from './fragrances.service.js';
import { FragrancesController } from './fragrances.controller.js';

@Module({
  controllers: [FragrancesController],
  providers: [FragrancesService],
  exports: [FragrancesService],
})
export class FragrancesModule {}
