import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "evrybites.blob.core.windows.net",
      },
    ],
  },
};

export default nextConfig;
