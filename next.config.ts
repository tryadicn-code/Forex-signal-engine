import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

function resolveDevOrigins(): string[] {
  const origins = new Set<string>();

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        origins.add(entry.address);
      }
    }
  }

  for (const origin of (process.env.FSE_ALLOWED_DEV_ORIGINS ?? "").split(",")) {
    const normalized = origin.trim();
    if (normalized) origins.add(normalized);
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  // Phase 9 self-hosting uses the minimal standalone server bundle so
  // stateless application replicas can sit behind a load balancer.
  output: "standalone",
  /**
   * The Phase 3 dashboard is frequently previewed from a phone over the local
   * network. Next.js development assets/endpoints are otherwise scoped to the
   * hostname the dev server was initialized with.
   *
   * Resolve active workstation IPv4 addresses at startup so phone previews
   * keep loading Next.js client assets even when DHCP changes the LAN address.
   * FSE_ALLOWED_DEV_ORIGINS can add explicit comma-separated hostnames/IPs.
   */
  allowedDevOrigins: resolveDevOrigins(),
};

export default nextConfig;
