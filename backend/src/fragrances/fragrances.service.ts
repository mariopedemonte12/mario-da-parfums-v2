import { Injectable } from '@nestjs/common';
import { CreateFragranceDto } from './dto/create-fragrance.dto.js';
import { UpdateFragranceDto } from './dto/update-fragrance.dto.js';

@Injectable()
export class FragrancesService {
  create(createFragranceDto: CreateFragranceDto) {
    return 'This action adds a new fragrance';
  }

  findAll() {
    return `This action returns all fragrances`;
  }

  findOne(id: number) {
    return `This action returns a #${id} fragrance`;
  }

  update(id: number, updateFragranceDto: UpdateFragranceDto) {
    return `This action updates a #${id} fragrance`;
  }

  remove(id: number) {
    return `This action removes a #${id} fragrance`;
  }
}
