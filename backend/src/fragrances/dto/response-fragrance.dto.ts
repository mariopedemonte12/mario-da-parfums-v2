import { Exclude, Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class ResponseFragranceDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Bleu de Chanel' })
  @Expose()
  name: string;

  @ApiProperty({ example: 'Chanel' })
  @Expose()
  brand: string;

  @ApiPropertyOptional({ example: 'Eau de Parfum', nullable: true })
  @Expose()
  concentration: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  description: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/images/bleu-de-chanel.jpg',
    nullable: true,
  })
  @Expose()
  imageUrl: string | null;

  @ApiPropertyOptional({ example: 'Woody Spicy', nullable: true })
  @Expose()
  olfactoryFamily: string | null;

  @ApiPropertyOptional({ example: 'Male', nullable: true })
  @Expose()
  targetAudience: string | null;

  @ApiPropertyOptional({ example: 'Medium-Strong', nullable: true })
  @Expose()
  longevity: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}
