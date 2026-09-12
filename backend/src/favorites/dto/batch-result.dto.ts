import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BatchResultDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  fragranceId: string;

  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  error?: string;
}
