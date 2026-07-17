import { NextRequest, NextResponse } from 'next/server';

/** 高德静态地图 REST API 基础 URL。 */
const STATIC_MAP_BASE = 'https://restapi.amap.com/v3/staticmap';

/**
 * 高德静态地图代理接口。
 *
 * <p>浏览器直接 fetch `restapi.amap.com` 会被 CORS 拦截（REST API 设计为服务端调用），
 * 因此前端通过本接口做服务端代理：前端传入 markers / size / location 等参数，
 * 服务端拼接 key 后请求高德 REST API，再以 blob 形式返回图片。
 *
 * <p>密钥使用服务端环境变量 `AMAP_REST_KEY`（推荐配置为"Web服务"类型 key），
 * 未配置时降级使用 `NEXT_PUBLIC_AMAP_KEY`。
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. 读取密钥（优先服务端专用 key）
  const apiKey = process.env.AMAP_REST_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AMap key 未配置' }, { status: 500 });
  }

  // 2. 拼接高德 REST URL
  const sanitizedQuery = sanitizeQuery(request.url);
  const amapUrl = `${STATIC_MAP_BASE}?${sanitizedQuery}&key=${encodeURIComponent(apiKey)}`;

  // 3. 服务端请求高德 REST API
  let amapResp: Response;
  try {
    amapResp = await fetch(amapUrl, {
      headers: {
        // 标识请求来源，避免被高德风控误判
        Referer: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `高德静态地图请求失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (!amapResp.ok) {
    return NextResponse.json(
      { error: `高德静态地图返回 ${amapResp.status}` },
      { status: amapResp.status },
    );
  }

  // 4. 验证响应确实是图片
  const contentType = amapResp.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    const text = await amapResp.text();
    return NextResponse.json(
      { error: `高德静态地图返回非图片内容：${text.slice(0, 200)}` },
      { status: 502 },
    );
  }

  // 5. 以 blob 透传返回
  const blob = await amapResp.arrayBuffer();
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * 从请求 URL 提取 query string 并做最小必要编码。
 *
 * <p>AMap REST API 要求 markers 中的 | 保持字面（作为 marker group 分隔符），
 * 但 size 参数中的 * 必须编码为 %2A。
 */
function sanitizeQuery(requestUrl: string): string {
  const qIndex = requestUrl.indexOf('?');
  if (qIndex === -1) return '';
  const rawQuery = requestUrl.slice(qIndex + 1);
  // 移除客户端可能误传的 key 参数（安全：key 只能由服务端注入）
  const filtered = rawQuery
    .split('&')
    .filter((pair) => {
      const lower = pair.toLowerCase();
      return !lower.startsWith('key=') && !lower.startsWith('key%3d');
    })
    .join('&');
  // 整体解码后仅编码 *，保留 AMap 结构字符 | 字面
  try {
    return decodeURIComponent(filtered).replace(/\*/g, '%2A');
  } catch {
    // 解码失败（非法 % 序列）时回退：仅编码 *
    return filtered.replace(/\*/g, '%2A');
  }
}
