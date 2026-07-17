import { NextRequest, NextResponse } from 'next/server';

/**
 * 高德逆地理编码代理服务。
 *
 * <p>浏览器端 JS API key 没有 REST API 权限（INVALID_USER_SCODE），
 * 因此前端通过本接口做服务端代理：前端传入经纬度，
 * 服务端用 AMAP_REST_KEY 调用高德 REST API，返回地址文本。
 *
 * <p>GET /api/geocode?lng=104.06&lat=30.67
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const lng = searchParams.get("lng");
  const lat = searchParams.get("lat");

  if (!lng || !lat) {
    return NextResponse.json({ error: "lng 和 lat 必填" }, { status: 400 });
  }
  const lngNum = Number(lng);
  const latNum = Number(lat);
  if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) {
    return NextResponse.json({ error: "lng 和 lat 需为有效数字" }, { status: 400 });
  }

  const apiKey = process.env.AMAP_REST_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AMap REST key 未配置" }, { status: 500 });
  }

  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(apiKey)}&location=${lngNum},${latNum}&extensions=all&output=JSON`;

  try {
    const resp = await fetch(url, {
      headers: { Referer: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" },
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `高德 API 返回 ${resp.status}` }, { status: 502 });
    }
    const data = await resp.json();
    if (data?.status !== "1") {
      return NextResponse.json({ error: `高德 API 错误: ${data?.info || "unknown"}` }, { status: 502 });
    }
    // 高德返回 formatted_address（下划线命名）
    const addr = data?.regeocode?.formatted_address;
    if (!addr) {
      return NextResponse.json({ error: "逆地理编码无结果" }, { status: 404 });
    }
    return NextResponse.json({ address: addr });
  } catch (err) {
    return NextResponse.json(
      { error: `逆地理编码请求失败: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
