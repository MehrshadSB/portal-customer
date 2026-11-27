import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RbacModule } from '../rbac/rbac.module';
import { AuthStateService } from './auth-state.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { OtpService } from './otp.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [JwtModule.register({}), forwardRef(() => RbacModule)],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, AuthStateService, OtpService, OidcService],
  exports: [AuthService, AuthStateService, JwtModule],
})
export class AuthModule {}
