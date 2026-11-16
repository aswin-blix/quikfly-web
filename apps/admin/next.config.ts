import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export served by a Worker (wrangler.jsonc). All data comes from the API at runtime.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
