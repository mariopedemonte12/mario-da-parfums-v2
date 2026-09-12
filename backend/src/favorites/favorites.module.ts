import { Module } from '@nestjs/common';
import { FavoritesService } from './favorites.service.js';
import { FavoritesController } from './favorites.controller.js';
import { FragrancesModule } from '../fragrances/fragrances.module.js';

@Module({
  imports: [FragrancesModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
