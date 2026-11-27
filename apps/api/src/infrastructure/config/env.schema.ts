import { z } from 'zod';

const DEV_JWT_FALLBACK = 'dev_only_replace_with_64_char_random_secret_for_jwt_signing_0123456789';
const DEV_OTP_HMAC_FALLBACK = 'dev_only_replace_with_64_char_otp_hmac_secret_for_otp_hashing_0123';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    PORTAL_URL: z.string().url().default('http://localhost:3000'),
    ADMIN_URL: z.string().url().default('http://localhost:3001'),

    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://portal:portal_dev_password@localhost:5433/portal_dev'),
    REDIS_URL: z.string().min(1).default('redis://localhost:6380'),

    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_FALLBACK),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(1209600),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // OIDC SSO Configuration
    OIDC_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    OIDC_ISSUER_URL: z.string().url().optional().or(z.literal('')),
    OIDC_CLIENT_ID: z.string().optional().or(z.literal('')),
    OIDC_CLIENT_SECRET: z.string().optional().or(z.literal('')),
    OIDC_SCOPES: z.string().default('openid profile email'),
    OIDC_PROVIDER_LABEL: z.string().default('Company SSO'),

    // SMS OTP Configuration
    SMS_PROVIDER: z.enum(['console', 'webhook', 'kavenegar']).default('console'),
    SMS_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
    SMS_API_KEY: z.string().optional().or(z.literal('')),
    SMS_TEMPLATE: z.string().default('verify'),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(600).default(180),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
    OTP_HMAC_SECRET: z.string().min(32).default(DEV_OTP_HMAC_FALLBACK),

    S3_ENDPOINT: z.string().url().default('http://localhost:9010'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('portal-attachments'),
    S3_ACCESS_KEY: z.string().min(1).default('rustfsadmin'),
    S3_SECRET_KEY: z.string().min(1).default('rustfssecret123'),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_FROM: z.string().min(3).default('Precision Ops Platform <no-reply@platform.local>'),

    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
  })
  .transform((env) => ({
    ...env,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
  }))
  .superRefine((env, ctx) => {
    if (env.OIDC_ENABLED) {
      if (!env.OIDC_ISSUER_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OIDC_ISSUER_URL'],
          message: 'OIDC_ISSUER_URL is required when OIDC_ENABLED=true',
        });
      }
      if (!env.OIDC_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OIDC_CLIENT_ID'],
          message: 'OIDC_CLIENT_ID is required when OIDC_ENABLED=true',
        });
      }
    }

    if (env.SMS_PROVIDER === 'webhook' && !env.SMS_WEBHOOK_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_WEBHOOK_URL'],
        message: 'SMS_WEBHOOK_URL is required when SMS_PROVIDER=webhook',
      });
    }
    if (env.SMS_PROVIDER === 'kavenegar' && !env.SMS_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_API_KEY'],
        message: 'SMS_API_KEY is required when SMS_PROVIDER=kavenegar',
      });
    }

    if (env.NODE_ENV !== 'production') return;

    if (env.JWT_ACCESS_SECRET === DEV_JWT_FALLBACK) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'Production requires a dedicated JWT_ACCESS_SECRET',
      });
    }
    if (env.OTP_HMAC_SECRET === DEV_OTP_HMAC_FALLBACK) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTP_HMAC_SECRET'],
        message: 'Production requires a dedicated OTP_HMAC_SECRET',
      });
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'Production requires COOKIE_SECURE=true',
      });
    }
    if (env.S3_SECRET_KEY === 'rustfssecret123') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_SECRET_KEY'],
        message: 'Production cannot use default S3_SECRET_KEY',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }
  return parsed.data;
}
