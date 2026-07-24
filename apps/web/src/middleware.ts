import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/globe-demo', '/offline.html', '/.well-known/assetlinks.json'];
const PUBLIC_PREFIXES = ['/_next', '/icons', '/manifest.json', '/sw.js'];

/**
 * 同源 API 请求经 Next.js 重写转发后仍会携带浏览器 Origin。
 *
 * 后端看到的目标地址是 8080，因而会把 127.0.0.1 或局域网地址误判为跨域请求。
 * 仅当 Origin 与当前 Web Host 完全一致时移除该头；真正的跨站请求继续交由后端
 * CORS 白名单校验，避免为修复本机访问而扩大可信来源范围。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api/')) {
    if (pathname === '/register') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (PUBLIC_PATHS.includes(pathname)
        || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.next();
    }

    const token = request.cookies.get('token')?.value;
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin || !host) {
    return NextResponse.next();
  }

  try {
    if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
      return NextResponse.next();
    }
  } catch {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  headers.delete('origin');
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/api/:path*', '/((?!api).*)'],
};
