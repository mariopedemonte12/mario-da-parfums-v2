import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Exclude()
export class ResponseListingDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @Expose()
  fragranceId: string;

  @ApiProperty({ example: 1 })
  @Expose()
  vendorId: number;

  @ApiProperty({ example: 100 })
  @Expose()
  sizeMl: number;

  @ApiProperty({ example: 89990 })
  @Expose()
  price: number;

  @ApiProperty({
    example: 'https://www.example-store.com/products/bleu-de-chanel-100ml',
  })
  @Expose()
  url: string;

  @ApiProperty({ example: true })
  @Expose()
  inStock: boolean;

  @ApiProperty()
  @Expose()
  scrapedAt: Date;
}
