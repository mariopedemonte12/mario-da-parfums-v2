import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { Role } from '../../shared/enums/role.enums.js';

@Exclude()
export class UserResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Jane Doe' })
  @Expose()
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @Expose()
  email: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  @Expose()
  role: Role;

  @ApiPropertyOptional({ example: 'users/avatars/1.jpg' })
  @Expose()
  photoS3Key: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}
