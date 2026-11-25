import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocalizationSettingsDto } from '@portal/types';
import type { UpdateLocalizationSettingsInput } from '@portal/validators';
import { eq } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { platformSettings } from '../../infrastructure/database/schema';
import { AuditService } from '../audit/audit.service';

const LOCALIZATION_KEY = 'localization';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
  ) {}

  async getLocalization(): Promise<LocalizationSettingsDto> {
    const [row] = await this.db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, LOCALIZATION_KEY));

    if (!row) {
      return {
        defaultLocale: DEFAULT_LOCALE,
        enabledLocales: [...SUPPORTED_LOCALES],
        calendarType: 'jalali',
        brandNameFa: 'آذرپارت صنعت',
        brandNameEn: 'AzarPart Mfg',
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      defaultLocale: row.defaultLocale,
      enabledLocales: row.enabledLocales,
      calendarType: row.calendarType,
      brandNameFa: row.brandNameFa,
      brandNameEn: row.brandNameEn,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateLocalization(
    dto: UpdateLocalizationSettingsInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<LocalizationSettingsDto> {
    const before = await this.getLocalization();
    const uniqueLocales = [...new Set(dto.enabledLocales)];

    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: platformSettings.id })
        .from(platformSettings)
        .where(eq(platformSettings.key, LOCALIZATION_KEY));

      if (existing.length > 0) {
        await tx
          .update(platformSettings)
          .set({
            defaultLocale: dto.defaultLocale,
            enabledLocales: uniqueLocales,
            calendarType: dto.calendarType,
            brandNameFa: dto.brandNameFa,
            brandNameEn: dto.brandNameEn,
            updatedByUserId: actor.id,
            updatedAt: new Date(),
          })
          .where(eq(platformSettings.key, LOCALIZATION_KEY));
      } else {
        await tx.insert(platformSettings).values({
          key: LOCALIZATION_KEY,
          defaultLocale: dto.defaultLocale,
          enabledLocales: uniqueLocales,
          calendarType: dto.calendarType,
          brandNameFa: dto.brandNameFa,
          brandNameEn: dto.brandNameEn,
          updatedByUserId: actor.id,
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          action: 'settings.localization_updated',
          entityType: 'platform_settings',
          summary: `Updated platform default language to ${dto.defaultLocale} (${dto.calendarType})`,
          beforeJson: before,
          afterJson: dto,
          meta,
        },
        tx,
      );
    });

    return this.getLocalization();
  }
}
