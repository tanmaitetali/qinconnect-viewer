/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@aws-sdk/client-cloudwatch-logs",
      "@aws-sdk/credential-providers",
      "@aws-sdk/client-bedrock-runtime",
    ],
  },
};

export default nextConfig;
