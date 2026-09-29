import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The Phase 3 dashboard is frequently previewed from a phone over the local
   * network. Next.js development assets/endpoints are otherwise scoped to the
   * hostname the dev server was initialized with.
   *
   * If the workstation LAN address changes, update this entry to match the new
   * address shown by ipconfig / Next.js "Network" URL.
   */
  allowedDevOrigins: ["192.168.1.25"],
};

export default nextConfig;
