import type { CheckinItem } from '@/types';
import { getValidItemCoordinate } from '@/lib/coordinates';

/** 高德静态地图 REST API 基础 URL。 */
const STATIC_MAP_BASE = 'https://restapi.amap.com/v3/staticmap';

/** 有效 POI 坐标（排除 null/0,0 伪坐标）。 */
interface LatLng {
  lat: number;
  lng: number;
  /** POI 名称（用于标注标签）。 */
  name: string;
}

/** AMap 静态地图标注尺寸。 */
type MarkerSize = 'small' | 'mid' | 'large';

/** 静态瓦片基准大小。高德静态地图 API 使用 512px 瓦片体系
 * （相当于标准 Web 墨卡托 256px 在 zoom+1 级别的像素密度）。 */
const TILE_SIZE = 512;

/**
 * POI 在静态地图图片上的相对坐标（0-1，用于 PDF 封面绘制连线叠加层）。
 */
export interface MarkerPosition {
  /** 图片宽度的比例（0-1）。 */
  x: number;
  /** 图片高度的比例（0-1）。 */
  y: number;
  /** 序号（1-based）。 */
  seq: number;
  /** POI 名称。 */
  name: string;
}

/** 静态地图请求结果（含图片数据 URL + 标注点相对坐标）。 */
export interface StaticMapResult {
  /** base64 PNG data URL；无数据时为 null（降级）。 */
  dataUrl: string | null;
  /** 标注点在图片上的相对坐标（0-1），用于 PDF 封面绘制路线连线叠加层。 */
  positions: MarkerPosition[];
}

/**
 * 静态地图拼接请求参数 + 标注点相对坐标。
 *
 * <p>相对坐标（0-1）用于在 PDF 封面上绘制路线连线。
 */
export interface StaticMapRequest {
  /** 高德 REST API query 串（不含 key）。 */
  query: string;
  /** 标注点在图片上的相对坐标（0-1）。 */
  positions: MarkerPosition[];
}

/**
 * 从打卡项中提取所有有效坐标点。
 *
 * <p>统一使用 display 坐标（用户修正优先），与 CheckinMap 渲染逻辑一致。
 * 排除 ABANDONED 和 (0,0) 无效坐标。
 */
export function collectValidCoords(items: CheckinItem[]): LatLng[] {
  return items
    .filter((i) => i.status !== 'ABANDONED')
    .map((i) => {
      const coordinate = getValidItemCoordinate(i);
      return coordinate ? { ...coordinate, name: i.poiName } : null;
    })
    .filter((coordinate): coordinate is LatLng => coordinate !== null);
}

/**
 * 经纬度 → 高德静态地图的世界像素坐标（Web 墨卡托投影）。
 *
 * <p>zoom 级别下，世界总像素 = 256 × 2^zoom。
 */
function lngLatToWorldPx(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * 计算各 POI 在静态地图图片上的相对坐标（0-1）。
 *
 * <p>以图片中心对应 center 经纬度，将每个 POI 投影到图片坐标系中。
 * 结果值为比例（0-1），可直接用于 PDF 封面 SVG 连线叠加层。
 *
 * @param coords 全部标注点坐标
 * @param center 图片中心经纬度
 * @param zoom 缩放级别
 * @param width 图片宽度（像素）
 * @param height 图片高度（像素）
 */
function calcMarkerPositions(
  coords: LatLng[],
  center: { lng: number; lat: number },
  zoom: number,
  width: number,
  height: number,
): MarkerPosition[] {
  const centerPx = lngLatToWorldPx(center.lng, center.lat, zoom);
  return coords.map((c, i) => {
    const px = lngLatToWorldPx(c.lng, c.lat, zoom);
    return {
      x: 0.5 + (px.x - centerPx.x) / width,
      y: 0.5 + (px.y - centerPx.y) / height,
      seq: i + 1,
      name: c.name,
    };
  });
}

/**
 * 构造高德静态地图 API 请求参数（不含 key）及标注点相对坐标。
 *
 * <p>标注点由本地图层（overlay）使用与底图相同的 Web 墨卡托投影绘制，
 * 因此 overlay 中的圆点 / 连线 / 数字与底图完全对齐（不存在 AMap 服务端
 * 渲染标注点位置与本地投影计算的偏差）。
 *
 * <p>使用自适应 zoom（zoom=auto 会导致 AMap 返回 20003）。
 * key 由服务端代理注入，此处不拼接。
 *
 * @param coords 有效坐标列表
 * @param options 可选配置
 * @returns `query`（不含 `?` 前缀）与 `positions`（相对坐标 0-1）；coords 为空时两者均为空
 */
export function buildStaticMapRequest(
  coords: LatLng[],
  options?: {
    /** 图片宽度（像素），默认 800。 */
    width?: number;
    /** 图片高度（像素），默认 600。 */
    height?: number;
    /** 高清模式（scale=2），默认 true。 */
    highRes?: boolean;
  },
): StaticMapRequest {
  if (coords.length === 0) return { query: '', positions: [] };

  const width = options?.width ?? 800;
  const height = options?.height ?? 600;
  const highRes = options?.highRes ?? true;

  // 基于全部有效坐标计算视图中心 + 缩放级别，20% 边距确保所有点都落在图内。
  const { centerLng, centerLat, zoom } = computeViewForCoords(coords, width, height, 0.2);

  // 注意：
  // 1. 不在 AMap 请求里带 markers 参数，避免服务端渲染标注点时与本地投影出现偏差。
  //    标注点（圆点 + 数字 + 连线）由 overlay 使用与底图相同的 Web 墨卡托投影绘制。
  // 2. AMap 静态地图 API v3 不支持 paths 参数（返回 20003），仅支持标记点。
  // 3. zoom=auto 会导致 20003 错误，需使用固定缩放级别。
  const params = [
    `location=${centerLng},${centerLat}`,
    `zoom=${zoom}`,
    `size=${width}*${height}`,
    highRes ? 'scale=2' : 'scale=1',
  ];

  const positions = calcMarkerPositions(coords, { lng: centerLng, lat: centerLat }, zoom, width, height);

  return { query: params.join('&'), positions };
}

/**
 * @deprecated 改用 {@link buildStaticMapRequest}。保留以兼容既有调用。
 *
 * 构造高德静态地图 API 参数串（不含 key）。
 *
 * @param coords 有效坐标列表
 * @param options 可选配置
 * @returns query string（不含 `?` 前缀）；coords 为空时返回空字符串
 */
export function buildStaticMapQuery(
  coords: LatLng[],
  options?: {
    width?: number;
    height?: number;
    highRes?: boolean;
  },
): string {
  return buildStaticMapRequest(coords, options).query;
}

/**
 * 根据框住全部坐标所需的视图，计算中心点和缩放级别。
 *
 * <p>流程：
 * <ol>
 *   <li>取全部坐标的经纬度最小/最大框，每边外加一定比例 padding（默认 20%）。</li>
 *   <li>中心点取 padded 框的中点。</li>
 *   <li>从高到低遍历 zoom，使得图片在该 zoom 下能覆盖 padded 框
 *       （每点在 X/Y 方向至少距边缘 minMarginPx 像素）。</li>
 * </ol>
 *
 * <p>处理 180° 经线跨越：当经度跨度 > 180° 时视为跨线，将负经度 +360 后计算。
 *
 * @param coords 全部有效坐标
 * @param imgWidth 图片宽度（像素）
 * @param imgHeight 图片高度（像素）
 * @param paddingRatio 框外扩比例（默认 0.2，即每边留 20% 边距）
 * @param minMarginPx 每点距图片边缘的最小像素边距（默认 40）
 */
export function computeViewForCoords(
  coords: LatLng[],
  imgWidth: number,
  imgHeight: number,
  paddingRatio = 0.2,
  minMarginPx = 40,
): { centerLng: number; centerLat: number; zoom: number } {
  if (coords.length === 0) return { centerLng: 0, centerLat: 0, zoom: 10 };
  if (coords.length === 1) return { centerLng: coords[0].lng, centerLat: coords[0].lat, zoom: 16 };

  // 检测 180° 经线跨越
  const lngs0180 = coords.map((c) => c.lng);
  const minLng0180 = Math.min(...lngs0180);
  const maxLng0180 = Math.max(...lngs0180);
  const crossesAntimeridian = maxLng0180 - minLng0180 > 180;
  const lngs = crossesAntimeridian
    ? coords.map((c) => (c.lng < 0 ? c.lng + 360 : c.lng))
    : lngs0180;

  // 经纬度框
  const lats = coords.map((c) => c.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // 经纬度每边外扩 paddingRatio
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;
  const lngPad = lngSpan * paddingRatio;
  const latPad = latSpan * paddingRatio;

  // 中心点（padded 框的中点）
  let centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  if (crossesAntimeridian && centerLng > 180) centerLng -= 360;

  // 覆盖 padded 框所需的每像素度数
  const paddedLngSpan = lngSpan + 2 * lngPad;
  const paddedLatSpan = latSpan + 2 * latPad;

  // 框的四个角点（含 padding），用于"全部落在图内"的精确检查
  const paddingBox = [
    { lng: minLng - lngPad, lat: minLat - latPad },
    { lng: minLng - lngPad, lat: maxLat + latPad },
    { lng: maxLng + lngPad, lat: minLat - latPad },
    { lng: maxLng + lngPad, lat: maxLat + latPad },
  ];

  // 从高到低尝试 zoom，选第一个使四个角都在距边缘 minMarginPx 内的级别
  for (let zoom = 18; zoom >= 3; zoom--) {
    if (boxFits(paddingBox, centerLng, centerLat, zoom, imgWidth, imgHeight, minMarginPx)) {
      return { centerLng, centerLat, zoom };
    }
  }
  return { centerLng, centerLat, zoom: 10 };
}

/**
 * 检查给定的框角点是否都能落在图片内，并距边缘 ≥ minMarginPx。
 *
 * <p>使用 Web 墨卡托投影将经纬度转世界像素，再相对于图片中心换算为像素偏移。
 */
function boxFits(
  box: { lng: number; lat: number }[],
  centerLng: number,
  centerLat: number,
  zoom: number,
  imgWidth: number,
  imgHeight: number,
  minMarginPx: number,
): boolean {
  const centerPx = lngLatToWorldPx(centerLng, centerLat, zoom);
  const halfW = imgWidth / 2;
  const halfH = imgHeight / 2;
  for (const c of box) {
    const px = lngLatToWorldPx(c.lng, c.lat, zoom);
    const dx = px.x - centerPx.x;
    const dy = px.y - centerPx.y;
    // 距左右/上下边缘的像素距离
    const marginX = halfW - Math.abs(dx);
    const marginY = halfH - Math.abs(dy);
    if (marginX < minMarginPx || marginY < minMarginPx) return false;
  }
  return true;
}

/**
 * 获取过滤后的有效坐标（含序号和名称），用于 PDF 封面图例。
 *
 * @returns 带图例信息的坐标列表
 */
export function getMapLegendCoords(items: CheckinItem[]): { seq: number; name: string; lng: number; lat: number }[] {
  const coords = collectValidCoords(items);
  return coords.map((c, i) => ({
    seq: i + 1,
    name: c.name,
    lng: c.lng,
    lat: c.lat,
  }));
}

/**
 * 获取 PDF 封面所需的地图数据：图片 data URL + 标注点相对坐标 + 图例。
 *
 * <p>一次调用即可获取封面渲染所需的全部地图信息。
 *
 * @param items 打卡项列表
 * @returns 封面地图数据
 */
export async function fetchMapCoverData(items: CheckinItem[]): Promise<{
  dataUrl: string | null;
  positions: MarkerPosition[];
  legend: { seq: number; name: string; lng: number; lat: number }[];
}> {
  const result = await fetchStaticMapImage(items);
  const legend = getMapLegendCoords(items);
  return { dataUrl: result.dataUrl, positions: result.positions, legend };
}

/**
 * @deprecated 改用 {@link buildStaticMapQuery} + 代理接口。保留以兼容既有测试。
 *
 * 构造高德静态地图 API 完整 URL（含 key）。
 *
 * @param coords 有效坐标列表
 * @param apiKey 高德 key（空串时返回空 URL）
 * @param options 可选配置
 * @returns 完整 URL；coords 为空时返回空字符串
 */
export function buildStaticMapUrl(
  coords: LatLng[],
  apiKey: string,
  options?: {
    width?: number;
    height?: number;
    highRes?: boolean;
  },
): string {
  if (coords.length === 0 || !apiKey) return '';
  const query = buildStaticMapQuery(coords, options);
  if (!query) return '';
  return `${STATIC_MAP_BASE}?key=${apiKey}&${query}`;
}

/**
 * 获取路线静态地图图片 + 标注点相对坐标。
 *
 * <p>通过 Next.js 服务端代理 (`/api/static-map`) 调用高德静态地图 REST API，
 * 避免浏览器直接 fetch `restapi.amap.com` 被 CORS 拦截。
 * 服务端注入 key（优先 `AMAP_REST_KEY`，降级 `NEXT_PUBLIC_AMAP_KEY`）。
 *
 * <p>整个流程不依赖 canvas/toDataURL，因此不受跨域瓦片污染影响。
 *
 * @param items 打卡项列表（从 PDF 页面的 tasks 中收集）
 * @returns 含 dataUrl（null 表示降级）和 positions（用于封面 SVG 连线）的结果
 */
export async function fetchStaticMapImage(items: CheckinItem[]): Promise<StaticMapResult> {
  const coords = collectValidCoords(items);
  if (coords.length === 0) return { dataUrl: null, positions: [] };

  // 构造不含 key 的参数串（key 由服务端代理注入）+ 相对坐标
  const { query, positions } = buildStaticMapRequest(coords);
  if (!query) return { dataUrl: null, positions: [] };

  // 通过 Next.js API 路由代理（绕过浏览器 CORS）
  const proxyUrl = `/api/static-map?${query}`;

  try {
    const resp = await fetch(proxyUrl, { method: 'GET' });
    if (!resp.ok) {
      console.warn(`[staticMap] 代理请求失败：HTTP ${resp.status}`);
      return { dataUrl: null, positions };
    }
    const blob = await resp.blob();
    // 验证返回的确实是图片（高德在 key 非法时返回 JSON 错误）
    if (!blob.type.startsWith('image/')) {
      console.warn(`[staticMap] 代理返回非图片内容：${blob.type}`);
      return { dataUrl: null, positions };
    }
    return { dataUrl: await blobToDataUrl(blob), positions };
  } catch (err) {
    console.warn('[staticMap] 静态地图获取失败：', err);
    return { dataUrl: null, positions };
  }
}

/**
 * 将 Blob 转为 base64 data URL。
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader 读取失败'));
    reader.readAsDataURL(blob);
  });
}
