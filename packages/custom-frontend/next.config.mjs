/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true, // ✅ This lets `next build` succeed even with lint errors
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*', // ✅ Proxy to Lightdash backend
      },
    ];
  },
};

export default nextConfig;
