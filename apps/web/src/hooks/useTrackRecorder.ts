'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RecordedTrackPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  recordedAt: string;
}

interface UseTrackRecorderResult {
  /** 是否正在录制。 */
  recording: boolean;
  /** 当前保留的有效轨迹点数量。 */
  pointCount: number;
  /** 开始一次新的轨迹录制。 */
  start: () => void;
  /** 停止录制并返回本次全部有效轨迹点。 */
  stop: () => RecordedTrackPoint[];
  /** 清除当前尚未上传的轨迹点。 */
  clear: () => void;
}

const MAX_ACCURACY_METERS = 60;
const MAX_POINTS_IN_MEMORY = 12_000;

function distanceInMeters(a: RecordedTrackPoint, b: RecordedTrackPoint): number {
  const earthRadius = 6_371_000;
  const latitudeDelta = ((b.latitude - a.latitude) * Math.PI) / 180;
  const longitudeDelta = ((b.longitude - a.longitude) * Math.PI) / 180;
  const value =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos((a.latitude * Math.PI) / 180)
      * Math.cos((b.latitude * Math.PI) / 180)
      * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/**
 * 浏览器 GPS 轨迹录制。
 *
 * 采样阈值会随速度和定位精度变化：步行保留更多细节，乘车时减少冗余点；
 * 同时设置最长采样间隔，避免长直线路段没有可用于回放的时间锚点。
 */
export function useTrackRecorder(): UseTrackRecorderResult {
  const [recording, setRecording] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const pointsRef = useRef<RecordedTrackPoint[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<RecordedTrackPoint | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => stopWatch, [stopWatch]);

  const shouldRecord = useCallback((point: RecordedTrackPoint): boolean => {
    if (point.accuracy === null || point.accuracy > MAX_ACCURACY_METERS) return false;

    const last = lastPointRef.current;
    if (!last) return true;

    const speed = Math.max(point.speed ?? 0, 0);
    const minimumDistance = speed > 8 ? 20 : speed > 2.2 ? 12 : 6;
    const accuracyFloor = Math.min(Math.max(point.accuracy * 0.35, 3), 15);
    const distanceThreshold = Math.max(minimumDistance, accuracyFloor);
    const maximumInterval = speed > 8 ? 10_000 : speed > 2.2 ? 15_000 : 30_000;
    const elapsed = Date.parse(point.recordedAt) - Date.parse(last.recordedAt);

    return distanceInMeters(last, point) >= distanceThreshold || elapsed >= maximumInterval;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || watchIdRef.current !== null) return;

    pointsRef.current = [];
    lastPointRef.current = null;
    setPointCount(0);
    setRecording(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point: RecordedTrackPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          recordedAt: new Date(position.timestamp).toISOString(),
        };
        if (!shouldRecord(point)) return;

        // 长时间录制也必须有明确的内存上限，超过后保留偶数点进行渐进降采样。
        if (pointsRef.current.length >= MAX_POINTS_IN_MEMORY) {
          pointsRef.current = pointsRef.current.filter((_, index) => index % 2 === 0);
        }
        pointsRef.current.push(point);
        lastPointRef.current = point;
        setPointCount(pointsRef.current.length);
      },
      () => {
        // 定位失败由浏览器权限提示承担；录制保持开启，以便权限恢复后继续采样。
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );
  }, [shouldRecord]);

  const stop = useCallback((): RecordedTrackPoint[] => {
    stopWatch();
    setRecording(false);
    return [...pointsRef.current];
  }, [stopWatch]);

  const clear = useCallback(() => {
    pointsRef.current = [];
    lastPointRef.current = null;
    setPointCount(0);
  }, []);

  return { recording, pointCount, start, stop, clear };
}
