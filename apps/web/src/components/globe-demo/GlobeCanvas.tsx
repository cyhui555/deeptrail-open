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
import {
  GLOBE_LAYER_PLACES,
  GLOBE_PLACES,
  GLOBE_ROUTES,
  type GlobeLayer,
  type GlobePlace,
  type GlobeRoute,
} from './globe-data';
import styles from './globe-demo.module.css';

export interface GlobeCanvasProps {
  activeLayer: GlobeLayer;
  selectedId: string;
  rotating: boolean;
  reducedMotion: boolean;
  resetSignal: number;
  retrySignal: number;
  onSelect: (id: string) => void;
  onReady: () => void;
  onError: (message: string) => void;
}

const INITIAL_VIEW = { lat: 31, lng: 78, altitude: 1.92 };

/**
 * Demo 使用 three-globe 同版本示例中的真实地球纹理。
 * 正式 Google Photorealistic 3D Tiles 需要 Cesium/deck.gl 类渲染器、授权 Key、
 * 计费与持续版权归因，不能把 Google Tile URL 直接替换到这组 2D 纹理中。
 */
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

function asPlace(item: object): GlobePlace {
  return item as GlobePlace;
}

function asRoute(item: object): GlobeRoute {
  return item as GlobeRoute;
}

function getPlaceTooltip(item: object) {
  const place = asPlace(item);
  const location = place.kind === 'landmark'
    ? `${place.city.zhHans}，${place.country.name.zhHans}`
    : place.country.name.zhHans;
  const summary = `${place.name.zhHans}，${location}，${place.category.name.zhHans}`;
  return place.kind === 'landmark'
    ? `${summary}。${place.description}`
    : summary;
}

function supportsWebGl() {
  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
}

export function GlobeCanvas({
  activeLayer,
  selectedId,
  rotating,
  reducedMotion,
  resetSignal,
  retrySignal,
  onSelect,
  onReady,
  onError,
}: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods>();
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [isReady, setIsReady] = useState(false);
  const activePlaces = GLOBE_LAYER_PLACES[activeLayer];
  const selected = GLOBE_PLACES.find((place) => place.id === selectedId)
    ?? activePlaces[0];

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

  useEffect(() => {
    if (!supportsWebGl()) {
      onError('当前浏览器或设备未启用 WebGL，无法绘制 3D 地球。');
    }
  }, [onError, retrySignal]);

  useEffect(() => {
    if (isReady) return undefined;

    const timeout = window.setTimeout(() => {
      onError('真实地球纹理加载超时，请检查网络后重试。');
    }, 20_000);

    return () => window.clearTimeout(timeout);
  }, [isReady, onError, retrySignal]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      setSize((current) => (
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
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
    const controls = globeRef.current?.controls();
    if (!controls || !isReady) return undefined;

    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.autoRotate = rotating && !reducedMotion;
    controls.autoRotateSpeed = 0.46;
    controls.minDistance = 120;
    controls.maxDistance = 430;

    return () => {
      controls.autoRotate = false;
    };
  }, [isReady, reducedMotion, rotating]);

  useEffect(() => {
    if (!isReady) return;
    globeRef.current?.pointOfView(
      {
        lat: selected.coordinates.lat,
        lng: selected.coordinates.lng,
        altitude: selected.kind === 'landmark' ? 1.08 : 1.48,
      },
      reducedMotion ? 0 : 850,
    );
  }, [isReady, reducedMotion, selected]);

  useEffect(() => {
    if (!isReady || resetSignal === 0) return;
    globeRef.current?.pointOfView(INITIAL_VIEW, reducedMotion ? 0 : 900);
  }, [isReady, reducedMotion, resetSignal]);

  useEffect(() => {
    // Three.js 材质持有 GPU 资源，卸载时主动释放，避免开发热更新累积显存。
    return () => globeMaterial.dispose();
  }, [globeMaterial]);

  const handleReady = useCallback(() => {
    const globe = globeRef.current;
    const renderer = globe?.renderer();

    globe?.lights(earthLights);
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
    }

    setIsReady(true);
    globe?.pointOfView(INITIAL_VIEW, reducedMotion ? 0 : 900);
    onReady();
  }, [earthLights, onReady, reducedMotion]);

  const isActiveRoute = useCallback((route: GlobeRoute) => (
    route.start.id === selectedId || route.end.id === selectedId
  ), [selectedId]);

  return (
    <div
      ref={containerRef}
      className={styles.globeCanvas}
      role="img"
      aria-label={`可交互 3D 地球，当前${activeLayer === 'route' ? '路线城市' : '著名景点'}为${selected.name.zhHans}`}
    >
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="#03070a"
        backgroundImageUrl={EARTH_ASSETS.stars}
        globeImageUrl={EARTH_ASSETS.surface}
        bumpImageUrl={EARTH_ASSETS.terrain}
        globeMaterial={globeMaterial}
        showAtmosphere
        atmosphereColor="#82c6e8"
        atmosphereAltitude={0.18}
        showGraticules={false}
        polygonsData={countryFeatures as Feature<Geometry>[]}
        polygonAltitude={0.002}
        polygonCapColor={() => 'rgba(0, 0, 0, 0)'}
        polygonSideColor={() => 'rgba(0, 0, 0, 0)'}
        polygonStrokeColor={() => 'rgba(215, 230, 236, 0.18)'}
        polygonsTransitionDuration={reducedMotion ? 0 : 500}
        pointsData={activePlaces}
        pointLat={(item) => asPlace(item).coordinates.lat}
        pointLng={(item) => asPlace(item).coordinates.lng}
        pointAltitude={0.018}
        pointRadius={(item) => {
          const place = asPlace(item);
          if (place.id === selectedId) return place.kind === 'landmark' ? 0.36 : 0.42;
          return place.kind === 'landmark' ? 0.18 : 0.23;
        }}
        pointColor={(item) => {
          const place = asPlace(item);
          if (place.id === selectedId) return '#b8ddf1';
          return place.kind === 'landmark' ? '#d1dfe5' : '#79a9c3';
        }}
        pointResolution={20}
        pointsTransitionDuration={reducedMotion ? 0 : 380}
        pointLabel={getPlaceTooltip}
        onPointClick={(item) => onSelect(asPlace(item).id)}
        labelsData={activePlaces}
        labelLat={(item) => asPlace(item).coordinates.lat}
        labelLng={(item) => asPlace(item).coordinates.lng}
        labelText={(item) => {
          const place = asPlace(item);
          // WebGL 精灵字体的中文回退在不同系统上不稳定，地球表面统一使用标准英文名。
          return place.kind === 'landmark' ? place.name.en : place.displayCode;
        }}
        labelColor={(item) => (
          asPlace(item).id === selectedId
            ? 'rgba(231, 245, 251, 0.98)'
            : 'rgba(198, 220, 229, 0.82)'
        )}
        labelAltitude={0.03}
        labelSize={(item) => {
          const place = asPlace(item);
          if (place.id === selectedId) return place.kind === 'landmark' ? 0.66 : 0.96;
          return place.kind === 'landmark' ? 0.46 : 0.66;
        }}
        labelDotRadius={0}
        labelIncludeDot={false}
        labelResolution={3}
        labelLabel={getPlaceTooltip}
        labelsTransitionDuration={reducedMotion ? 0 : 380}
        onLabelClick={(item) => onSelect(asPlace(item).id)}
        arcsData={activeLayer === 'route' ? GLOBE_ROUTES : []}
        arcStartLat={(item) => asRoute(item).start.coordinates.lat}
        arcStartLng={(item) => asRoute(item).start.coordinates.lng}
        arcEndLat={(item) => asRoute(item).end.coordinates.lat}
        arcEndLng={(item) => asRoute(item).end.coordinates.lng}
        arcColor={(item: object): string[] => (
          isActiveRoute(asRoute(item))
            ? ['rgba(168, 211, 233, 0.28)', 'rgba(184, 221, 241, 0.96)']
            : ['rgba(89, 135, 157, 0.12)', 'rgba(101, 153, 178, 0.48)']
        )}
        arcAltitudeAutoScale={0.34}
        arcStroke={(item) => isActiveRoute(asRoute(item)) ? 0.58 : 0.28}
        arcDashLength={reducedMotion ? 1 : 0.42}
        arcDashGap={reducedMotion ? 0 : 0.18}
        arcDashAnimateTime={reducedMotion ? 0 : 2500}
        arcsTransitionDuration={reducedMotion ? 0 : 500}
        ringsData={reducedMotion ? [] : [selected]}
        ringLat={(item) => asPlace(item).coordinates.lat}
        ringLng={(item) => asPlace(item).coordinates.lng}
        ringColor={() => (
          (time: number) => `rgba(184, 221, 241, ${Math.max(0, 0.62 - time)})`
        )}
        ringMaxRadius={3.2}
        ringPropagationSpeed={1.2}
        ringRepeatPeriod={1800}
        onGlobeReady={handleReady}
      />
    </div>
  );
}
