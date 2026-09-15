import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateListingDto } from './create-listing.dto.js';

export class BatchCreateListingsDto {
  @ApiProperty({ type: [CreateListingDto], minItems: 1, maxItems: 100 })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateListingDto)
  items: CreateListingDto[];
}
