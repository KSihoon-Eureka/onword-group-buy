/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace packages (TypeScript 직접 import — @onword/agent 도 raw .ts export).
  transpilePackages: [
    '@onword/types',
    '@onword/db',
    '@onword/agent',
    '@onword/ui',
  ],
  // server-only native deps. @onword/agent 가 transpile 대상이라
  // dependency graph 따라가다 sharp/playwright/fsevents.node 가 webpack 에 들어오는 걸 차단.
  experimental: {
    serverComponentsExternalPackages: [
      'sharp',
      'playwright',
      '@anthropic-ai/sdk',
      'resend',
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    // .node 바이너리는 webpack 에서 파싱 불가 → ignore.
    // fsevents 는 macOS optional dep — 항상 ignore 안전.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^fsevents$/,
      }),
    )
    config.module.rules.push({
      test: /\.node$/,
      use: 'ignore-loader',
    })

    if (isServer) {
      // server bundle 에서 native deps 를 require() 로 외부 처리.
      // transpilePackages 가 @onword/agent 를 transpile 하면서
      // playwright/sharp/chromium-bidi 까지 webpack 이 끌어오는 걸 차단.
      // Node 가 직접 require → fsevents/.node 바이너리 정상 처리.
      const SERVER_EXTERNALS = [
        'playwright',
        'playwright-core',
        'sharp',
        'chromium-bidi',
        'electron',
      ]
      config.externals.push(({ request }, cb) => {
        if (!request) return cb()
        if (SERVER_EXTERNALS.includes(request)) {
          return cb(null, 'commonjs ' + request)
        }
        if (request.startsWith('chromium-bidi/') || request.startsWith('playwright-core/')) {
          return cb(null, 'commonjs ' + request)
        }
        cb()
      })
    } else {
      // client bundle 에 server-only native deps 유입 차단
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        'fs/promises': false,
        path: false,
        os: false,
        crypto: false,
        fsevents: false,
        chokidar: false,
        sharp: false,
        playwright: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
