/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace packages (TypeScript 직접 import)
  transpilePackages: [
    '@onword/types',
    '@onword/db',
    '@onword/agent',
    '@onword/ui',
  ],
  // Sharp는 native binary 필요
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'playwright'],
  },
}

module.exports = nextConfig
