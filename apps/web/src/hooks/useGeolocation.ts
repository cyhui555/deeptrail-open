'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface GeolocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
}

interface UseGeolocationOptions {
  /** 是否持续监听位置变化，默认 false（仅获取一次）。 */
  watch?: boolean;
  /** 高精度模式，默认 true。 */
  enableHighAccuracy?: boolean;
}

/**
 * 地理定位 Hook。
 *
 * <p>封装 navigator.geolocation API，支持单次获取和持续监听两种模式。
 * 高精度模式下浏览器会优先使用 GPS，精度可达 5-20 米。
 */
export function useGeolocation(options: UseGeolocationOptions = {}): GeolocationState {
  const { watch = false, enableHighAccuracy = true } = options;
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    loading: false,
    error: null,
  });
  const watchIdRef = useRef<number | null>(null);

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    setState({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      loading: false,
      error: null,
    });
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    setState((prev) => ({
      ...prev,
      loading: false,
      error: err.message || '定位失败',
    }));
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((prev) => ({ ...prev, error: '浏览器不支持地理定位' }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    if (watch) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        { enableHighAccuracy, timeout: 15000, maximumAge: 10000 },
      );
    } else {
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        { enableHighAccuracy, timeout: 15000, maximumAge: 10000 },
      );
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [watch, enableHighAccuracy, handleSuccess, handleError]);

  return state;
}
