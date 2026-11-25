import { Body, Controller, Patch, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type UpdateProfileInput,
  updateProfileSchema,
} from '@portal/validators';
import type { Response } from 'express';
import { CurrentUser, ReqMeta } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { AuthService } from './auth.service';

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly authService: AuthService) {}

  @Patch()
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(
    @CurrentUser() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.authService.updateProfile(actor, body, meta);
    return { data };
  }

  @Patch('password')
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(
    @CurrentUser() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @ReqMeta() meta: RequestMetadata,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.changePassword(actor, body, res, meta);
    return { data: { ok: true } };
  }
}
