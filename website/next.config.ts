import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  turbopack: {
    root: fileURLToPath(new URL("..", import.meta.url)),
  },
};

export default nextConfig;
