import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for the demo. Remove when you add server features (SSR, middleware, route handlers).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
