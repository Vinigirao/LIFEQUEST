import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Upload de extratos (.xlsx/.csv) pela aba Finanças
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
