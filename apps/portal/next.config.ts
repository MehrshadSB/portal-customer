import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@portal/ui',
    '@portal/i18n',
    '@portal/api-client',
    '@portal/validators',
    '@portal/types',
  ],
  async rewrites() {
    const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBase}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
