import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { FindUsersDto } from './dto/find-users.dto.js';
import { UserResponseDto } from './dto/response-user.dto.js';
import { PaginatedUsersDto } from './dto/paginated-users.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SelfOrAdminGuard } from '../common/guards/self-or-admin.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../shared/enums/role.enums.js';

function toResponseDto(user: unknown): UserResponseDto {
  return plainToInstance(UserResponseDto, user, {
    excludeExtraneousValues: true,
  });
}

// Owns: managing existing user accounts (profile fields, role, deletion).
// Admin manages any account; an authenticated user manages only their own.
// Does not own account creation, login, or password hashing/verification —
// creating a user (including an admin-created one) is `auths`'s job.
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List users with filters and pagination (admin only)',
  })
  @ApiResponse({ status: 200, type: PaginatedUsersDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  async findAll(@Query() query: FindUsersDto): Promise<PaginatedUsersDto> {
    const { data, total } = await this.usersService.findAll(query);
    return {
      data: data.map(toResponseDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  @Get(':id')
  @UseGuards(SelfOrAdminGuard)
  @ApiOperation({ summary: 'Get a user by id (self or admin)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({
    status: 403,
    description: 'Caller is neither the owner nor an admin',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findOne(id);
    return toResponseDto(user);
  }

  @Patch(':id')
  @UseGuards(SelfOrAdminGuard)
  @ApiOperation({ summary: 'Update a user profile (self or admin)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({
    status: 403,
    description: 'Caller is neither the owner nor an admin',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Name or email already in use' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(id, dto);
    return toResponseDto(user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.usersService.remove(id);
  }
}
