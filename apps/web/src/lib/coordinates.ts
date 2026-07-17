import type { CheckinItem } from '@/types';

export interface ValidCoordinate {
  lat: number;
  lng: number;
}

/**
 * 判断坐标是否可安全交给地图 SDK。
 *
 * <p>旅迹当前只处理中国境内旅行，任一坐标轴为 0 都是上游检索失败的伪值；
 * 同时拒绝非有限值和越界值，避免一个脏点让整张地图或 PDF 路线失效。
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat !== 0
    && lng !== 0
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

/** 获取打卡项的展示坐标；用户修正值优先于 AI 原始坐标。 */
export function getValidItemCoordinate(item: CheckinItem): ValidCoordinate | null {
  const lat = item.displayLat ?? item.poiLat;
  const lng = item.displayLng ?? item.poiLng;
  return isValidCoordinate(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}
