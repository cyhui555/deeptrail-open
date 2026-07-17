/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 固定构建并发，避免开发机与 CI 因可用内存差异产生不可复现的静态 worker OOM。
  experimental: { cpus: 1 },
  // 地图组件的 effect 生命周期由自动化测试覆盖，保持 Strict Mode 以尽早暴露副作用问题。
  reactStrictMode: true,
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8080';
    return [
      // 浏览器始终访问同源 /api；Next 服务端再转发到后端，保证 HttpOnly Cookie 可用。
      { source: '/api/health', destination: `${backendUrl}/api/health` },
      { source: '/api/auth/:path*', destination: `${backendUrl}/api/auth/:path*` },
      { source: '/api/admin/:path*', destination: `${backendUrl}/api/admin/:path*` },
      { source: '/api/ai/:path*', destination: `${backendUrl}/api/ai/:path*` },
      { source: '/api/itineraries/:path*', destination: `${backendUrl}/api/itineraries/:path*` },
      { source: '/api/trips/:path*', destination: `${backendUrl}/api/trips/:path*` },
      { source: '/api/media/:path*', destination: `${backendUrl}/api/media/:path*` },
      { source: '/api/telemetry/:path*', destination: `${backendUrl}/api/telemetry/:path*` },
    ];
  },
};

module.exports = nextConfig;
