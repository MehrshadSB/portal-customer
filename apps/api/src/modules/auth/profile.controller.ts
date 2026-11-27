import { Body, Controller, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UpdateProfileInput, updateProfileSchema } from '@portal/validators';
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
}
