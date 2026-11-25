import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppSurface } from '@portal/types';
import {
  type AcceptInviteInput,
  acceptInviteSchema,
  appSurfaceSchema,
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type LoginInput,
  loginSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
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
  @SkipCsrf()
  @Post(':surface/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user for portal or admin surface' })
  async login(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @ReqMeta() meta: RequestMetadata,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.authService.login(surface, body, res, meta);
    return { data: actor };
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

  @Public()
  @SkipCsrf()
  @Post(':surface/forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ) {
    await this.authService.forgotPassword(surface, body.email);
    return {
      data: {
        message: 'If an active account matches that email, reset instructions have been sent.',
      },
    };
  }

  @Public()
  @SkipCsrf()
  @Post(':surface/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete password reset using emailed token' })
  async resetPassword(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @ReqMeta() meta: RequestMetadata,
  ) {
    await this.authService.resetPassword(surface, body, meta);
    return { data: { ok: true } };
  }

  @Public()
  @SkipCsrf()
  @Post(':surface/accept-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate invited account and set initial password' })
  async acceptInvite(
    @Param('surface', new ZodValidationPipe(appSurfaceSchema)) surface: AppSurface,
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const result = await this.authService.acceptInvite(surface, body, meta);
    return { data: result };
  }

  @Get('me')
  @ApiOperation({ summary: 'Return authenticated session context for active surface' })
  me(@CurrentUser() actor: AuthenticatedActor) {
    return { data: actor };
  }
}
