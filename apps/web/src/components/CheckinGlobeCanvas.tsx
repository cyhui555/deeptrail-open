'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  MeshPhongMaterial,
  TextureLoader,
} from 'three';
import countriesAtlas from 'world-atlas/countries-110m.json';
import { getValidItemCoordinate, isValidCoordinate } from '@/lib/coordinates';
import type { CheckinItem, TrackPoint } from '@/types';
import type { CheckinRouteMode } from './CheckinGlobe';
import styles from './checkin-globe.module.css';

interface CheckinGlobeCanvasProps {
  items: CheckinItem[];
  trackPoints: TrackPoint[];
  routeMode: CheckinRouteMode;
  selectedItemId: number | null;
  viewportScopeKey?: string | number;
  reducedMotion: boolean;
  onMarkerClick?: (itemId: number) => void;
  getSegmentColor?: (from: CheckinItem, to: CheckinItem) => string | null;
  onReady: () => void;
  onError: (message: string) => void;
}

interface GlobePoint {
  item: CheckinItem;
  lat: number;
  lng: number;
  sequence: number;
}

interface GlobePathPoint {
  lat: number;
  lng: number;
  altitude: number;
}

interface GlobePath {
  id: string;
  kind: 'planned' | 'actual' | 'gps';
  color: string;
  points: GlobePathPoint[];
}

const EARTH_ASSETS = {
  surface: 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-blue-marble.jpg',
  terrain: 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-topology.png',
  water: 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-water.png',
  stars: 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/night-sky.png',
} as const;

const topology = countriesAtlas as unknown as Topology<{
  countries: GeometryCollection;
}>;
const countryFeatures = (
  feature(topology, topology.objects.countries) as FeatureCollection<Geometry>
).features;

const STATUS_LABEL: Record<CheckinItem['status'], string> = {
  PENDING: '待打卡',
  CHECKED_IN: '已打卡',
  ABANDONED: '已放弃',
};

function asPoint(item: object): GlobePoint {
  return item as GlobePoint;
}

function asPath(item: object): GlobePath {
  return item as GlobePath;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;');
}

function getPointTooltip(item: object) {
  const point = asPoint(item);
  const address = point.item.poiAddress
    ? `<span>${escapeHtml(point.item.poiAddress)}</span>`
    : '';
  return [
    '<div class="checkin-globe-tooltip">',
    `<strong>${escapeHtml(point.item.poiName)}</strong>`,
    `<span>${STATUS_LABEL[point.item.status]}</span>`,
    address,
    '</div>',
  ].join('');
}

function getDefaultView(points: GlobePoint[]) {
  if (points.length === 0) return { lat: 30, lng: 105, altitude: 1.85 };

  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lngRadians = points.map((point) => point.lng * Math.PI / 180);
  const lng = Math.atan2(
    lngRadians.reduce((sum, value) => sum + Math.sin(value), 0),
    lngRadians.reduce((sum, value) => sum + Math.cos(value), 0),
  ) * 180 / Math.PI;
  const latValues = points.map((point) => point.lat);
  const lngOffsets = points.map((point) => {
    const delta = point.lng - lng;
    return ((delta + 540) % 360) - 180;
  });
  const spread = Math.max(
    Math.max(...latValues) - Math.min(...latValues),
    Math.max(...lngOffsets) - Math.min(...lngOffsets),
  );
  const altitude = spread < 1
    ? 0.82
    : spread < 5
      ? 1.05
      : spread < 20
        ? 1.32
        : spread < 60
          ? 1.58
          : 2.05;

  return { lat, lng, altitude };
}

export function CheckinGlobeCanvas({
  items,
  trackPoints,
  routeMode,
  selectedItemId,
  viewportScopeKey,
  reducedMotion,
  onMarkerClick,
  getSegmentColor,
  onReady,
  onError,
}: CheckinGlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods>();
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [isReady, setIsReady] = useState(false);

  const globeMaterial = useMemo(() => new MeshPhongMaterial({
    color: '#f3f7f8',
    emissive: '#071014',
    emissiveIntensity: 0.12,
    shininess: 18,
    specular: '#7892a0',
    bumpScale: 4.8,
  }), []);

  const earthLights = useMemo(() => {
    const ambient = new AmbientLight(new Color('#bfd1d8'), 1.25);
    const sunlight = new DirectionalLight(new Color('#fff6e6'), 2.15);
    sunlight.position.set(-1.4, 1.1, 1.6);
    return [ambient, sunlight];
  }, []);

  const points = useMemo<GlobePoint[]>(() => items.flatMap((item, sequence) => {
    if (item.status === 'ABANDONED') return [];
    const coordinate = getValidItemCoordinate(item);
    return coordinate ? [{ item, ...coordinate, sequence }] : [];
  }), [items]);

  const pointById = useMemo(
    () => new Map(points.map((point) => [point.item.id, point])),
    [points],
  );
  const selectedPoint = selectedItemId == null ? null : pointById.get(selectedItemId) ?? null;
  const defaultView = useMemo(() => getDefaultView(points), [points]);
  const labelPoints = useMemo(
    () => points.length <= 12
      ? points
      : selectedPoint
        ? [selectedPoint]
        : [],
    [points, selectedPoint],
  );

  const createLocationMarker = useCallback((item: object) => {
    const point = asPoint(item);
    const marker = document.createElement('button');
    const status = document.createElement('span');
    const name = document.createElement('span');
    marker.type = 'button';
    marker.className = [
      styles.locationMarker,
      point.item.status === 'CHECKED_IN'
        ? styles.locationMarkerChecked
        : styles.locationMarkerPending,
      point.item.id === selectedItemId ? styles.locationMarkerSelected : '',
    ].filter(Boolean).join(' ');
    marker.setAttribute(
      'aria-label',
      `${point.item.poiName}，${STATUS_LABEL[point.item.status]}，查看打卡卡片`,
    );
    status.className = styles.locationMarkerStatus;
    status.setAttribute('aria-hidden', 'true');
    name.textContent = point.item.poiName;
    marker.append(status, name);
    marker.addEventListener('pointerdown', (event) => event.stopPropagation());
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      onMarkerClick?.(point.item.id);
    });
    return marker;
  }, [onMarkerClick, selectedItemId]);

  const paths = useMemo<GlobePath[]>(() => {
    const nextPaths: GlobePath[] = [];
    const showPlanned = routeMode === 'planned' || routeMode === 'all';
    const showActual = routeMode === 'actual' || routeMode === 'all';
    const showGps = routeMode === 'gps' || routeMode === 'all';

    if (showPlanned) {
      for (let index = 0; index < items.length - 1; index += 1) {
        const from = items[index];
        const to = items[index + 1];
        if (from.status === 'ABANDONED' || to.status === 'ABANDONED') continue;
        const start = getValidItemCoordinate(from);
        const end = getValidItemCoordinate(to);
        if (!start || !end) continue;
        nextPaths.push({
          id: `planned:${from.id}:${to.id}`,
          kind: 'planned',
          color: getSegmentColor?.(from, to) || '#5f91aa',
          points: [
            { ...start, altitude: 0.012 },
            { ...end, altitude: 0.012 },
          ],
        });
      }
    }

    if (showActual) {
      const checkedIn = items
        .filter((item) => item.status === 'CHECKED_IN')
        .sort((left, right) => {
          const leftTime = left.checkedInAt ? Date.parse(left.checkedInAt) : 0;
          const rightTime = right.checkedInAt ? Date.parse(right.checkedInAt) : 0;
          return leftTime - rightTime;
        });
      for (let index = 0; index < checkedIn.length - 1; index += 1) {
        const from = checkedIn[index];
        const to = checkedIn[index + 1];
        const start = getValidItemCoordinate(from);
        const end = getValidItemCoordinate(to);
        if (!start || !end) continue;
        nextPaths.push({
          id: `actual:${from.id}:${to.id}`,
          kind: 'actual',
          color: '#4aa879',
          points: [
            { ...start, altitude: 0.018 },
            { ...end, altitude: 0.018 },
          ],
        });
      }
    }

    if (showGps) {
      const gpsPoints = trackPoints
        .filter((point) => isValidCoordinate(point.latitude, point.longitude))
        .sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt))
        .map((point) => ({
          lat: point.latitude,
          lng: point.longitude,
          altitude: 0.022,
        }));
      if (gpsPoints.length >= 2) {
        nextPaths.push({
          id: 'gps',
          kind: 'gps',
          color: '#ef6b63',
          points: gpsPoints,
        });
      }
    }

    return nextPaths;
  }, [getSegmentColor, items, routeMode, trackPoints]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const nextSize = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      };
      setSize((current) => (
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize
      ));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    let active = true;
    const waterTexture = loader.load(
      EARTH_ASSETS.water,
      (texture) => {
        if (!active) {
          texture.dispose();
          return;
        }
        globeMaterial.specularMap = texture;
        globeMaterial.needsUpdate = true;
      },
      undefined,
      () => {
        if (!active) return;
        globeMaterial.specularMap = null;
        globeMaterial.needsUpdate = true;
      },
    );

    return () => {
      active = false;
      if (globeMaterial.specularMap === waterTexture) {
        globeMaterial.specularMap = null;
      }
      waterTexture.dispose();
    };
  }, [globeMaterial]);

  useEffect(() => {
    if (isReady) return undefined;
    const timeout = window.setTimeout(() => {
      onError('卫星地表加载超时，请检查网络后重试，或切回平面地图。');
    }, 20_000);
    return () => window.clearTimeout(timeout);
  }, [isReady, onError]);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls || !isReady) return undefined;
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.autoRotate = false;
    controls.minDistance = 118;
    controls.maxDistance = 460;
    return () => {
      controls.autoRotate = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    const view = selectedPoint
      ? { lat: selectedPoint.lat, lng: selectedPoint.lng, altitude: 1.04 }
      : defaultView;
    globeRef.current?.pointOfView(view, reducedMotion ? 0 : 620);
  }, [defaultView, isReady, reducedMotion, selectedPoint, selectedItemId]);

  useEffect(() => {
    // 列表或点位已有选中项时，由上一个 effect 保持焦点，避免范围切换把镜头拉回全局。
    if (!isReady || selectedPoint) return;
    globeRef.current?.pointOfView(defaultView, reducedMotion ? 0 : 620);
  }, [defaultView, isReady, reducedMotion, selectedPoint, viewportScopeKey]);

  useEffect(() => () => globeMaterial.dispose(), [globeMaterial]);

  const handleReady = useCallback(() => {
    const globe = globeRef.current;
    const renderer = globe?.renderer();
    globe?.lights(earthLights);
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
    }
    setIsReady(true);
    globe?.pointOfView(defaultView, reducedMotion ? 0 : 620);
    onReady();
  }, [defaultView, earthLights, onReady, reducedMotion]);

  return (
    <div ref={containerRef} className={styles.canvas}>
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="#061015"
        backgroundImageUrl={EARTH_ASSETS.stars}
        globeImageUrl={EARTH_ASSETS.surface}
        bumpImageUrl={EARTH_ASSETS.terrain}
        globeMaterial={globeMaterial}
        showAtmosphere
        atmosphereColor="#86bfd9"
        atmosphereAltitude={0.16}
        showGraticules={false}
        polygonsData={countryFeatures as Feature<Geometry>[]}
        polygonAltitude={0.002}
        polygonCapColor={() => 'rgba(0, 0, 0, 0)'}
        polygonSideColor={() => 'rgba(0, 0, 0, 0)'}
        polygonStrokeColor={() => 'rgba(218, 232, 237, 0.18)'}
        polygonsTransitionDuration={reducedMotion ? 0 : 400}
        pointsData={points}
        pointLat={(item) => asPoint(item).lat}
        pointLng={(item) => asPoint(item).lng}
        pointAltitude={0.024}
        pointRadius={(item) => (
          asPoint(item).item.id === selectedItemId ? 0.5 : 0.3
        )}
        pointColor={(item) => {
          const point = asPoint(item);
          if (point.item.id === selectedItemId) return '#e8f6fc';
          return point.item.status === 'CHECKED_IN' ? '#4aa879' : '#f28a48';
        }}
        pointResolution={18}
        pointsTransitionDuration={reducedMotion ? 0 : 360}
        pointLabel={getPointTooltip}
        onPointClick={(item) => onMarkerClick?.(asPoint(item).item.id)}
        htmlElementsData={labelPoints}
        htmlLat={(item) => asPoint(item).lat}
        htmlLng={(item) => asPoint(item).lng}
        htmlAltitude={0.042}
        htmlElement={createLocationMarker}
        htmlElementVisibilityModifier={(element, visible) => {
          element.style.opacity = visible ? '1' : '0';
          element.style.pointerEvents = visible ? 'auto' : 'none';
        }}
        htmlTransitionDuration={reducedMotion ? 0 : 320}
        pathsData={paths}
        pathPoints={(item) => asPath(item).points}
        pathPointLat="lat"
        pathPointLng="lng"
        pathPointAlt="altitude"
        pathColor={(item: object) => asPath(item).color}
        pathStroke={(item: object) => {
          const path = asPath(item);
          if (path.kind === 'actual') return 0.58;
          if (path.kind === 'gps') return 0.3;
          return 0.4;
        }}
        pathDashLength={(item: object) => asPath(item).kind === 'planned' ? 0.16 : 1}
        pathDashGap={(item: object) => asPath(item).kind === 'planned' ? 0.08 : 0}
        pathDashAnimateTime={0}
        pathTransitionDuration={reducedMotion ? 0 : 420}
        onGlobeReady={handleReady}
      />
    </div>
  );
}
