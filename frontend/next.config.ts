import type { NextConfig } from "next";

const backendUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://prisere-backend.onrender.com/v1";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
