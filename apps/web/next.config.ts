import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for the demo. Remove when you add server features (SSR, middleware, route handlers).
  output: "export",
  images: { unoptimized: true },
  // UI strings are Flutter ARB files (JSON) in packages/shared/i18n, shared with the apps.
  turbopack: { rules: { "*.arb": { type: "json" } } },
  // The single-file demo builds with webpack (npm run build:demo), which needs the same rule.
  webpack: (config) => {
    config.module.rules.push({ test: /\.arb$/, type: "json" });
    return config;
  },
};

export default nextConfig;
