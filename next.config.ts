import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 9 self-hosting uses the minimal standalone server bundle so
  // stateless application replicas can sit behind a load balancer.
  output: "standalone",
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
