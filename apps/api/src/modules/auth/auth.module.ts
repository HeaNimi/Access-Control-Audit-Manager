import { Module } from '@nestjs/common';

import { AuthGuard } from '../../common/auth/auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { DatabaseModule } from '../../common/database/database.module';
import { DirectoryModule } from '../directory/directory.module';
import { AuthController } from './auth.controller';
import { AuthTokenService } from './auth-token.service';
import { AuthService } from './auth.service';

@Module({
  imports: [DatabaseModule, DirectoryModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenService, AuthGuard, RolesGuard],
  exports: [AuthService, AuthTokenService, AuthGuard, RolesGuard],
})
export class AuthModule {}
