import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async rewrites() {
    const backendOrigin = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000';
    return [
      {
        source: '/backend-api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${backendOrigin}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
