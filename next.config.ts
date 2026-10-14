import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  logging: {
    // Server Action arguments carry credentials (bank passwords, the app
    // password, the provider API key); Next's dev server prints them by default.
    serverFunctions: false,
  },
};

export default nextConfig;
