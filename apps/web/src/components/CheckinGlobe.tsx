'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPinned, MousePointer2, RefreshCw } from 'lucide-react';
import { getValidItemCoordinate, isValidCoordinate } from '@/lib/coordinates';
import type { CheckinItem, TrackPoint } from '@/types';
import styles from './checkin-globe.module.css';

const CheckinGlobeCanvas = dynamic(
  () => import('./CheckinGlobeCanvas').then((module) => module.CheckinGlobeCanvas),
  { ssr: false, loading: () => null },
);

export type CheckinRouteMode = 'planned' | 'actual' | 'gps' | 'all';

export interface CheckinGlobeProps {
  items: CheckinItem[];
  trackPoints?: TrackPoint[];
  routeMode?: CheckinRouteMode;
  selectedItemId?: number | null;
  height?: string;
  scopeLabel: string;
  viewportScopeKey?: string | number;
  onMarkerClick?: (itemId: number) => void;
  getSegmentColor?: (from: CheckinItem, to: CheckinItem) => string | null;
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return reducedMotion;
}

function supportsWebGl() {
  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
}

export function CheckinGlobe({
  items,
  trackPoints = [],
  routeMode = 'planned',
  selectedItemId = null,
  height = '55vh',
  scopeLabel,
  viewportScopeKey,
  onMarkerClick,
  getSegmentColor,
}: CheckinGlobeProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySignal, setRetrySignal] = useState(0);
  const [webGlSupported, setWebGlSupported] = useState<boolean | null>(null);
  const reducedMotion = useReducedMotionPreference();

  const visibleItems = useMemo(
    () => items.filter(
      (item) => item.status !== 'ABANDONED' && getValidItemCoordinate(item) !== null,
    ),
    [items],
  );
  const validTrackPointCount = useMemo(
    () => trackPoints.filter(
      (point) => isValidCoordinate(point.latitude, point.longitude),
    ).length,
    [trackPoints],
  );
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    const supported = supportsWebGl();
    setWebGlSupported(supported);
    if (!supported) {
      setError('当前浏览器或设备未启用 WebGL，请切回平面地图。');
    }
  }, [retrySignal]);

  const handleReady = useCallback(() => {
    setReady(true);
    setError(null);
  }, []);

  const handleError = useCallback((message: string) => {
    setReady(false);
    setError(message);
  }, []);

  const handleRetry = () => {
    setReady(false);
    setError(null);
    setWebGlSupported(null);
    setRetrySignal((current) => current + 1);
  };

  const hasRenderableData = visibleItems.length > 0 || validTrackPointCount >= 2;
  const globeLabel = selectedItem
    ? `可交互 3D 地球，${scopeLabel}共 ${visibleItems.length} 个地点，当前选中${selectedItem.poiName}`
    : `可交互 3D 地球，${scopeLabel}共 ${visibleItems.length} 个地点`;

  return (
    <section
      className={styles.shell}
      style={{ height }}
      aria-label={`${scopeLabel} 3D 地球`}
      data-testid="checkin-globe"
      data-checkin-globe-ready={ready ? 'true' : 'false'}
      data-checkin-globe-point-count={visibleItems.length}
      data-checkin-globe-track-point-count={validTrackPointCount}
    >
      {hasRenderableData && webGlSupported ? (
        <div className={styles.canvasHost} role="group" aria-label={globeLabel}>
          <CheckinGlobeCanvas
            key={retrySignal}
            items={items}
            trackPoints={trackPoints}
            routeMode={routeMode}
            selectedItemId={selectedItemId}
            viewportScopeKey={viewportScopeKey}
            reducedMotion={reducedMotion}
            onMarkerClick={onMarkerClick}
            getSegmentColor={getSegmentColor}
            onReady={handleReady}
            onError={handleError}
          />
        </div>
      ) : null}

      {!hasRenderableData && (
        <div className={styles.stateOverlay} role="status">
          <MapPinned aria-hidden="true" />
          <strong>暂无可显示的地点坐标</strong>
          <span>完成坐标补全后，地点和路线会出现在 3D 地球上。</span>
        </div>
      )}

      {hasRenderableData && !error && !ready && (
        <div className={styles.stateOverlay} role="status">
          <div className={styles.loadingGlobe} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <strong>正在绘制 3D 行程</strong>
          <span>卫星地表与打卡点加载完成后即可拖动查看。</span>
        </div>
      )}

      {error && (
        <div className={`${styles.stateOverlay} ${styles.errorOverlay}`} role="alert">
          <MapPinned aria-hidden="true" />
          <strong>3D 地球暂时无法显示</strong>
          <span>{error}</span>
          <button type="button" onClick={handleRetry}>
            <RefreshCw aria-hidden="true" />
            重新检测
          </button>
        </div>
      )}

      {ready && (
        <>
          <div className={styles.legend} aria-label="3D 地球图例">
            <span><i className={styles.pendingPoint} />待打卡</span>
            <span><i className={styles.checkedPoint} />已打卡</span>
            {(routeMode === 'planned' || routeMode === 'all') && (
              <span><i className={styles.plannedLine} />计划路线</span>
            )}
            {(routeMode === 'actual' || routeMode === 'all') && (
              <span><i className={styles.actualLine} />实际路线</span>
            )}
            {(routeMode === 'gps' || routeMode === 'all') && (
              <span><i className={styles.gpsLine} />GPS 轨迹</span>
            )}
          </div>
          <div className={styles.interactionHint}>
            <MousePointer2 aria-hidden="true" />
            拖动旋转，点击地点查看打卡卡片
          </div>
        </>
      )}
    </section>
  );
}
