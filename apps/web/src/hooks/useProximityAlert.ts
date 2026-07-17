'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProximityEvent } from '@/types';

interface UseProximityAlertOptions {
  /** POI 纬度。 */
  poiLat: number;
  /** POI 经度。 */
  poiLng: number;
  /** POI 名称。 */
  poiName: string;
  /** 打卡半径（米），默认 200。 */
  radius?: number;
  /** 当前用户纬度。 */
  userLat: number | null;
  /** 当前用户经度。 */
  userLng: number | null;
}

/**
 * 地理围栏接近提醒 Hook。
 *
 * <p>根据用户 GPS 坐标与 POI 坐标计算 Haversine 距离，
 * 当用户进入地理围栏范围内时触发回调。
 *
 * <p>使用 Haversine 公式计算两点间球面距离，精度满足城市级打卡场景。
 */
export function useProximityAlert(options: UseProximityAlertOptions): ProximityEvent | null {
  const { poiLat, poiLng, poiName, radius = 200, userLat, userLng } = options;
  const [event, setEvent] = useState<ProximityEvent | null>(null);
  const lastInsideRef = useRef(false);

  const calculateDistance = useCallback(
    (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c);
    },
    [],
  );

  useEffect(() => {
    if (userLat === null || userLng === null) return;

    const distance = calculateDistance(userLat, userLng, poiLat, poiLng);
    const isInside = distance <= radius;

    if (isInside !== lastInsideRef.current) {
      lastInsideRef.current = isInside;
      setEvent({ poiName, distance, radius, isInside });
    }
  }, [userLat, userLng, poiLat, poiLng, poiName, radius, calculateDistance]);

  return event;
}
