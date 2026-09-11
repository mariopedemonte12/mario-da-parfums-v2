import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FragrancesService } from './fragrances.service.js';
import { CreateFragranceDto } from './dto/create-fragrance.dto.js';
import { UpdateFragranceDto } from './dto/update-fragrance.dto.js';

@Controller('fragrances')
export class FragrancesController {
  constructor(private readonly fragrancesService: FragrancesService) {}

  @Post()
  create(@Body() createFragranceDto: CreateFragranceDto) {
    return this.fragrancesService.create(createFragranceDto);
  }

  @Get()
  findAll() {
    return this.fragrancesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fragrancesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFragranceDto: UpdateFragranceDto) {
    return this.fragrancesService.update(+id, updateFragranceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fragrancesService.remove(+id);
  }
}
