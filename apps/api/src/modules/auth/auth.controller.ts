import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';

import type {
  AuthLoginResponse,
  AuthUserSearchResult,
  AuthenticatedUserProfile,
  RoleCode,
} from '@acam-ts/contracts';

import { AuthGuard } from '../../common/auth/auth.guard';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthLoginResponse> {
    return this.authService.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUserProfile {
    return user;
  }

  @Get('users/search')
  @UseGuards(AuthGuard)
  async searchUsers(
    @Query('query') query?: string,
    @Query('role') role?: RoleCode,
  ): Promise<AuthUserSearchResult> {
    return this.authService.searchUsers(query ?? '', role);
  }
}
