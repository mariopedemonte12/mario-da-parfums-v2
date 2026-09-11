import { PartialType } from '@nestjs/mapped-types';
import { CreateFragranceDto } from './create-fragrance.dto.js';

export class UpdateFragranceDto extends PartialType(CreateFragranceDto) {}
