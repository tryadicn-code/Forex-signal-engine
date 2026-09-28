import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The Phase 3 dashboard is frequently previewed from a phone over the local
   * network. If the workstation LAN address changes, update this entry to match
   * the new address shown by ipconfig / the Next.js "Network" URL.
   */
  allowedDevOrigins: ["192.168.1.5"],

  /**
   * The development indicator overlaps the mobile workstation controls. Runtime
   * and build errors still surface in the terminal/error overlay.
   */
  devIndicators: false,
};

export default nextConfig;
