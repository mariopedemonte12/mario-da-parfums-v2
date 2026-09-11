import { Module } from '@nestjs/common';
import { FragrancesService } from './fragrances.service.js';
import { FragrancesController } from './fragrances.controller.js';

@Module({
  controllers: [FragrancesController],
  providers: [FragrancesService],
})
export class FragrancesModule {}
