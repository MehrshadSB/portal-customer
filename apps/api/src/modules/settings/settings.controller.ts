import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type UpdateLocalizationSettingsInput,
  updateLocalizationSettingsSchema,
} from '@portal/validators';
import {
  AllowedSurfaces,
  CurrentUser,
  Public,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get('localization')
  @ApiOperation({ summary: 'Get platform default language, enabled locales, and calendar config' })
  async getLocalization() {
    const data = await this.settingsService.getLocalization();
    return { data };
  }

  @Patch('localization')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.SYSTEM_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update platform language, calendar, and bilingual brand settings' })
  async updateLocalization(
    @Body(new ZodValidationPipe(updateLocalizationSettingsSchema))
    body: UpdateLocalizationSettingsInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.settingsService.updateLocalization(body, actor, meta);
    return { data };
  }
}
