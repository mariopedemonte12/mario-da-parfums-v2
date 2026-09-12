import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, ValidateNested } from 'class-validator';
import { UpdateListingDto } from './update-listing.dto.js';

export class UpdateListingItemDto extends UpdateListingDto {
  @ApiProperty({ description: 'Id of the listing to update', example: 1 })
  @IsInt()
  id: number;
}

export class BatchUpdateListingsDto {
  @ApiProperty({ type: [UpdateListingItemDto], minItems: 1 })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateListingItemDto)
  items: UpdateListingItemDto[];
}
