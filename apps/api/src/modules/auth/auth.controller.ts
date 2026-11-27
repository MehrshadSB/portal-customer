import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppSurface } from '@portal/types';
import {
  appSurfaceSchema,
  type RequestOtpInput,
  requestOtpSchema,
  type VerifyOtpInput,
  verifyOtpSchema,
} from '@portal/validators';
import type { Response } from 'express';
import { CurrentUser, Public, ReqMeta, SkipCsrf } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type {
  AuthenticatedActor,
  RequestMetadata,
  RequestWithAuth,
} from '../../common/types/auth-context';
import { AuthService } from './auth.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get(':surface/methods')
  @ApiOperation({ summary: 'List enabled authentication methods (OIDC SSO / SMS OTP)' })
  methods(@Param('surface', new ZodValidationPipe(appSurfaceSchema)) _surface: AppSurface) {
    return { data: this.authService.getAuthMethods() };
  }

  @Public()
  @SkipCsrf()
  @Post(':surface/otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request SMS OTP login code for an admin-provisioned active profile' })
  async requestOtp(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Body(new ZodValidationPipe(requestOtpSchema)) body: RequestOtpInput,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.authService.requestOtp(surface, body, meta);
    return { data };
  }

  @Public()
  @SkipCsrf()
  @Post(':surface/otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify SMS OTP code and issue surface-isolated session cookies' })
  async verifyOtp(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpInput,
    @ReqMeta() meta: RequestMetadata,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.authService.verifyOtp(surface, body, res, meta);
    return { data: actor };
  }

  @Public()
  @Get(':surface/sso/start')
  @ApiOperation({ summary: 'Initiate OIDC Authorization Code + PKCE SSO sign-in' })
  async startSso(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Res() res: Response,
  ) {
    try {
      const redirectUrl = await this.authService.startSso(surface);
      return res.redirect(302, redirectUrl);
    } catch (err) {
      const code = extractErrorCode(err, 'SSO_NOT_CONFIGURED');
      const base = this.authService.getSurfaceBaseUrl(surface).replace(/\/$/, '');
      return res.redirect(302, `${base}/login?error=${encodeURIComponent(code)}`);
    }
  }

  @Public()
  @Get(':surface/sso/callback')
  @ApiOperation({ summary: 'Complete OIDC SSO callback and issue surface-isolated cookies' })
  async ssoCallback(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Query() query: { code?: string; state?: string; error?: string },
    @ReqMeta() meta: RequestMetadata,
    @Res() res: Response,
  ) {
    const base = this.authService.getSurfaceBaseUrl(surface).replace(/\/$/, '');
    try {
      await this.authService.completeSsoCallback(surface, query, res, meta);
      return res.redirect(302, `${base}/`);
    } catch (err) {
      const code = extractErrorCode(err, 'SSO_FAILED');
      return res.redirect(302, `${base}/login?error=${encodeURIComponent(code)}`);
    }
  }

  @Public()
  @Post(':surface/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate surface refresh token and issue new access cookie' })
  async refresh(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Req() req: RequestWithAuth,
    @ReqMeta() meta: RequestMetadata,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefresh = req.cookies?.[`${surface}_refresh_token`] as string | undefined;
    const actor = await this.authService.refresh(surface, rawRefresh, res, meta);
    return { data: actor };
  }

  @Public()
  @Post(':surface/logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out of current surface session' })
  async logout(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Req() req: RequestWithAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefresh = req.cookies?.[`${surface}_refresh_token`] as string | undefined;
    await this.authService.logout(surface, rawRefresh, res);
    return { data: { ok: true } };
  }

  @Post(':surface/logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all sessions for current user on surface' })
  async logoutAll(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(surface, actor, res, meta);
    return { data: { ok: true } };
  }

  @Get('me')
  @ApiOperation({ summary: 'Return authenticated session context for active surface' })
  me(@CurrentUser() actor: AuthenticatedActor) {
    return { data: actor };
  }
}

function extractErrorCode(err: unknown, fallback: string): string {
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (typeof response === 'object' && response !== null && 'code' in response) {
      return String((response as { code: unknown }).code);
    }
  }
  return fallback;
}
