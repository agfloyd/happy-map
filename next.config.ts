import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Phone photos can easily exceed the 1MB default. We also downscale on the
      // client before upload, so 8MB is plenty of headroom.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
