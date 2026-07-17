import { NextRequest, NextResponse } from 'next/server';

/** POI 搜索结果项（前端提示下拉用）。 */
interface PoiTip {
  id: string;
  name: string;
  district: string;
  address: string;
  location: { lng: number; lat: number } | null;
}

/**
 * 高德 POI 搜索代理服务（关键词搜索）。
 *
 * <p>浏览器端 AMap.PlaceSearch 插件会受到 JS API 密钥 REST 权限限制（INVALID_USER_SCODE），
 * 因此前端通过本接口做服务端代理：前端传入 keywords，
 * 服务端尝试使用 AMAP_REST_KEY 调用高德 Web 服务 API。
 *
 * <p>注意：AMAP_REST_KEY 可能没有 Web 服务 POI 搜索权限（Engine 返回空）。
 * 此时 fallback 到 AMAP_JS_KEY 通过 JS API 的 web 端查询也不可用（同样权限问题），
 * 最终返回空列表。这种现象通常需要在 AMAP 控制台为 key 开通"Web服务"权限。
 *
 * <p>GET /api/search-poi?keywords=成都宽窄巷子&city=全国&limit=8
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const keywords = searchParams.get("keywords");
  const city = searchParams.get("city") || "全国";
  const limit = Math.min(Number(searchParams.get("limit")) || 8, 25);

  if (!keywords || !keywords.trim()) {
    return NextResponse.json({ tips: [] });
  }

  const restKey = process.env.AMAP_REST_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!restKey) {
    return NextResponse.json({ tips: [], error: "AMap REST key 未配置" });
  }

  // 1) 尝试 Web 服务 API: place/text（按关键词搜索）
  const url = `https://restapi.amap.com/v3/place/text?key=${encodeURIComponent(restKey)}&keywords=${encodeURIComponent(keywords.trim())}&city=${encodeURIComponent(city)}&offset=${limit}&page=1&extensions=base&output=JSON&citylimit=false`;

  try {
    const resp = await fetch(url, {
      headers: { Referer: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.status === "1" && data?.pois?.length) {
        const tips: PoiTip[] = data.pois.map((p: any): PoiTip => {
          // 高德 location 字段可能是 "lng,lat" 字符串或 {lng, lat} 对象
          let loc: { lng: number; lat: number } | null = null;
          if (p.location) {
            if (typeof p.location === "string" && p.location.includes(",")) {
              const [lng, lat] = p.location.split(",").map(Number);
              if (Number.isFinite(lng) && Number.isFinite(lat)) {
                loc = { lng, lat };
              }
            } else if (p.location.lng != null && p.location.lat != null) {
              loc = { lng: Number(p.location.lng), lat: Number(p.location.lat) };
            }
          }
          return {
            id: p.id ?? p.name,
            name: p.name ?? "",
            district: p.districtname || p.adname || p.pname || "",
            address: p.address || p.addressname || "",
            location: loc,
          };
        });
        return NextResponse.json({ tips });
      }
    }
  } catch (err) {
    console.error("[search-poi] place/text 请求失败:", err);
  }

  // 2) fallback: GeoCode 正向地理编码（关键词 → 坐标），仅返回单个结果
  const geoUrl = `https://restapi.amap.com/v3/geocode/geo?key=${encodeURIComponent(restKey)}&address=${encodeURIComponent(keywords.trim())}&city=${encodeURIComponent(city)}&output=JSON`;
  try {
    const resp = await fetch(geoUrl, {
      headers: { Referer: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.status === "1" && data?.geocodes?.length) {
        const g = data.geocodes[0];
        const loc = g.location?.lng != null ? g.location : (typeof g.location === "string" && g.location.includes(",") ? { lng: Number(g.location.split(",")[0]), lat: Number(g.location.split(",")[1]) } : null);
        if (loc) {
          const tip: PoiTip = {
            id: g.id || keywords,
            name: g.formatted_address || keywords,
            district: g.district || g.city || "",
            address: g.formatted_address || "",
            location: { lng: loc.lng, lat: loc.lat },
          };
          return NextResponse.json({ tips: [tip] });
        }
      }
    }
  } catch (err) {
    console.error("[search-poi] geocode/geo fallback 失败:", err);
  }

  return NextResponse.json({ tips: [] });
}
