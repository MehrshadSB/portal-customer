import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readRootEnv(keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const rootEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
  if (!existsSync(rootEnvPath)) return result;

  const lines = readFileSync(rootEnvPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!keys.includes(key)) continue;
    const val = line.slice(eqIdx + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    result[key] = val;
  }
  return result;
}

const rootEnv = readRootEnv(['API_PORT', 'API_INTERNAL_URL', 'NEXT_PUBLIC_API_URL']);
const fallbackApiOrigin = `http://localhost:${process.env.API_PORT || rootEnv.API_PORT || '4000'}`;
const apiInternalUrl =
  process.env.API_INTERNAL_URL || rootEnv.API_INTERNAL_URL || fallbackApiOrigin;
const publicApiUrl =
  process.env.NEXT_PUBLIC_API_URL || rootEnv.NEXT_PUBLIC_API_URL || fallbackApiOrigin;

const nextConfig: NextConfig = {
  transpilePackages: [
    '@portal/ui',
    '@portal/i18n',
    '@portal/api-client',
    '@portal/validators',
    '@portal/types',
  ],
  env: {
    NEXT_PUBLIC_API_URL: publicApiUrl,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiInternalUrl.replace(/\/$/, '')}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
