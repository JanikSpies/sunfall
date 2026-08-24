import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces the real runtime dependency graph into .next/standalone so the
  // production Docker image can ship just that instead of all of node_modules.
  output: "standalone",
};

export default nextConfig;
