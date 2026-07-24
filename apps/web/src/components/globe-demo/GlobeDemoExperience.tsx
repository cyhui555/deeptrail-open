'use client';

/* eslint-disable @next/next/no-img-element -- Wikimedia Commons 固定宽度缩略图保留原始授权链，不经过 Demo 图片代理。 */

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Globe2,
  Landmark,
  MapPin,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Route,
} from 'lucide-react';
import type { GlobeCanvasProps } from './GlobeCanvas';
import {
  GLOBE_LAYER_PLACES,
  GLOBE_PLACES,
  type GlobeLandmark,
  type GlobeLayer,
} from './globe-data';
import styles from './globe-demo.module.css';

const GlobeCanvas = dynamic<GlobeCanvasProps>(
  () => import('./GlobeCanvas').then((module) => module.GlobeCanvas),
  {
    ssr: false,
    loading: () => <GlobeLoading />,
  },
);

interface GlobeErrorBoundaryProps {
  children: ReactNode;
  resetSignal: number;
  onError: (message: string) => void;
}

interface GlobeErrorBoundaryState {
  failed: boolean;
}

class GlobeErrorBoundary extends Component<GlobeErrorBoundaryProps, GlobeErrorBoundaryState> {
  state: GlobeErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): GlobeErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error.message || '3D 地球初始化失败。');
  }

  componentDidUpdate(previous: GlobeErrorBoundaryProps) {
    if (previous.resetSignal !== this.props.resetSignal && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function GlobeLoading() {
  return (
    <div className={styles.loadingVisual} aria-hidden="true">
      <div className={styles.loadingGlobe}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

interface LandmarkPhotoProps {
  landmark: GlobeLandmark;
  compact?: boolean;
}

function LandmarkPhoto({ landmark, compact = false }: LandmarkPhotoProps) {
  const [failedSrc, setFailedSrc] = useState('');
  const failed = failedSrc === landmark.photo.src;

  if (failed) {
    return (
      <span
        className={styles.landmarkPhotoFallback}
        role={compact ? undefined : 'img'}
        aria-hidden={compact || undefined}
        aria-label={compact ? undefined : `${landmark.name.zhHans}实景图暂时无法显示`}
      >
        <Landmark aria-hidden="true" strokeWidth={1.55} />
        {!compact && <span>实景图暂时无法显示</span>}
      </span>
    );
  }

  return (
    <img
      className={styles.landmarkPhoto}
      src={landmark.photo.src}
      alt={compact ? '' : landmark.photo.alt}
      width={landmark.photo.width}
      height={landmark.photo.height}
      loading="lazy"
      decoding="async"
      style={{ objectPosition: landmark.photo.objectPosition }}
      onError={() => setFailedSrc(landmark.photo.src)}
    />
  );
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

export function GlobeDemoExperience() {
  const [activeLayer, setActiveLayer] = useState<GlobeLayer>('route');
  const [selectedId, setSelectedId] = useState(GLOBE_LAYER_PLACES.route[0].id);
  const [rotating, setRotating] = useState(true);
  const [runtimeState, setRuntimeState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [runtimeMessage, setRuntimeMessage] = useState('');
  const [resetSignal, setResetSignal] = useState(0);
  const [retrySignal, setRetrySignal] = useState(0);
  const reducedMotion = useReducedMotionPreference();
  const activePlaces = GLOBE_LAYER_PLACES[activeLayer];

  const selected = useMemo(
    () => GLOBE_PLACES.find((place) => place.id === selectedId)
      ?? activePlaces[0],
    [activePlaces, selectedId],
  );
  const selectedLocation = selected.kind === 'landmark'
    ? `${selected.city.zhHans}，${selected.country.name.zhHans}`
    : selected.country.name.zhHans;

  useEffect(() => {
    if (reducedMotion) setRotating(false);
  }, [reducedMotion]);

  const handleReady = useCallback(() => {
    setRuntimeState('ready');
    setRuntimeMessage('');
  }, []);

  const handleError = useCallback((message: string) => {
    setRuntimeState('error');
    setRuntimeMessage(message);
  }, []);

  const handleSelectPlace = useCallback((id: string) => {
    setSelectedId(id);
    setRotating(false);
  }, []);

  const handleSelectLayer = (layer: GlobeLayer) => {
    if (layer === activeLayer) return;
    setActiveLayer(layer);
    setSelectedId(GLOBE_LAYER_PLACES[layer][0].id);
    setRotating(false);
  };

  const retry = () => {
    setRuntimeState('loading');
    setRuntimeMessage('');
    setRetrySignal((current) => current + 1);
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageAtmosphere} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <Globe2 strokeWidth={1.65} />
            </span>
            <span>
              <strong>旅迹</strong>
              <small>地球路线实验</small>
            </span>
          </div>

          <Link className={styles.backLink} href="/">
            <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
            返回旅迹
          </Link>
        </header>

        <div className={styles.heroGrid}>
          <div className={styles.story}>
            <section aria-labelledby="globe-demo-title">
              <p className={styles.eyebrow}>真实地球路线</p>
              <h1 id="globe-demo-title" className={styles.title}>
                把一次旅行，放回地球上
              </h1>
              <p className={styles.intro}>
                旋转真实卫星地表，切换路线城市与著名景点。
              </p>

              <div className={styles.controls} aria-label="地球播放控制">
                <button
                  type="button"
                  className={styles.primaryControl}
                  aria-pressed={reducedMotion || !rotating}
                  disabled={reducedMotion}
                  onClick={() => setRotating((current) => !current)}
                >
                  {reducedMotion || rotating
                    ? <Pause aria-hidden="true" />
                    : <Play aria-hidden="true" />}
                  {reducedMotion
                    ? '自动旋转已关闭'
                    : rotating
                      ? '暂停旋转'
                      : '继续旋转'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryControl}
                  onClick={() => setResetSignal((current) => current + 1)}
                >
                  <RotateCcw aria-hidden="true" />
                  重置视角
                </button>
              </div>
            </section>

            <section className={styles.routeSection} aria-labelledby="globe-route-title">
              <div className={styles.layerControls} role="group" aria-label="地球信息图层">
                <button
                  type="button"
                  className={`${styles.layerButton} ${activeLayer === 'route' ? styles.layerButtonActive : ''}`}
                  aria-pressed={activeLayer === 'route'}
                  onClick={() => handleSelectLayer('route')}
                >
                  <Route aria-hidden="true" strokeWidth={1.7} />
                  路线城市
                </button>
                <button
                  type="button"
                  className={`${styles.layerButton} ${activeLayer === 'landmarks' ? styles.layerButtonActive : ''}`}
                  aria-pressed={activeLayer === 'landmarks'}
                  onClick={() => handleSelectLayer('landmarks')}
                >
                  <Landmark aria-hidden="true" strokeWidth={1.7} />
                  著名景点
                </button>
              </div>

              <div className={styles.routeHeading}>
                {activeLayer === 'route'
                  ? <Route aria-hidden="true" strokeWidth={1.7} />
                  : <Landmark aria-hidden="true" strokeWidth={1.7} />}
                <h2 id="globe-route-title">
                  {activeLayer === 'route' ? '示例路线' : '代表景点'}
                </h2>
              </div>

              <div
                className={`${styles.destinationList} ${activeLayer === 'landmarks' ? styles.landmarkCardList : ''}`}
                aria-label={activeLayer === 'route' ? '路线目的地列表' : '著名景点列表'}
              >
                {activePlaces.map((place) => {
                  const active = place.id === selectedId;
                  if (place.kind === 'landmark') {
                    return (
                      <button
                        key={place.id}
                        type="button"
                        className={`${styles.destinationButton} ${styles.landmarkCardButton} ${active ? styles.destinationButtonActive : ''}`}
                        aria-current={active ? 'location' : undefined}
                        aria-label={`查看${place.name.zhHans}景点介绍`}
                        onClick={() => handleSelectPlace(place.id)}
                      >
                        <span className={styles.landmarkCardMedia} aria-hidden="true">
                          <LandmarkPhoto landmark={place} compact />
                        </span>
                        <span className={styles.landmarkCardCopy}>
                          <span className={styles.destinationName}>
                            <strong>{place.name.zhHans}</strong>
                            <small>{place.city.zhHans}</small>
                          </span>
                          <span className={styles.destinationChapter}>{place.listLabel}</span>
                        </span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={place.id}
                      type="button"
                      className={`${styles.destinationButton} ${active ? styles.destinationButtonActive : ''}`}
                      aria-current={active ? 'location' : undefined}
                      onClick={() => handleSelectPlace(place.id)}
                    >
                      <span className={styles.destinationCode}>{place.displayCode}</span>
                      <span className={styles.destinationName}>
                        <strong>{place.name.zhHans}</strong>
                        <small>{place.country.name.zhHans}</small>
                      </span>
                      <span className={styles.destinationChapter}>{place.listLabel}</span>
                    </button>
                  );
                })}
              </div>
              {selected.kind === 'landmark' ? (
                <article
                  className={`${styles.selectedDetail} ${styles.landmarkDetailCard}`}
                  aria-live="polite"
                >
                  <div className={styles.landmarkFeatureMedia}>
                    <LandmarkPhoto landmark={selected} />
                  </div>
                  <div className={styles.landmarkFeatureBody}>
                    <div className={styles.selectedHeading}>
                      <strong>{selected.name.zhHans}</strong>
                      <small>{selected.name.en}</small>
                    </div>
                    <div className={styles.selectedMeta}>
                      <span>{selectedLocation}</span>
                      <span>{selected.category.name.zhHans}</span>
                    </div>
                    <div
                      className={styles.landmarkStory}
                      aria-label={`${selected.name.zhHans}景点介绍`}
                    >
                      <div className={styles.landmarkStoryHeader}>
                        <span>景点介绍</span>
                        <a
                          className={styles.landmarkSource}
                          href={selected.source.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`查看${selected.name.zhHans}资料来源：${selected.source.label}`}
                          title={selected.source.label}
                        >
                          资料来源
                          <ExternalLink aria-hidden="true" strokeWidth={1.7} />
                        </a>
                      </div>
                      <p className={styles.landmarkIntroduction}>
                        {selected.introduction}
                      </p>
                      <div className={styles.landmarkHighlights}>
                        <span>核心看点</span>
                        <p>{selected.highlights.join('、')}</p>
                      </div>
                      <div
                        className={styles.landmarkPhotoCredit}
                        aria-label={`${selected.name.zhHans}图片授权信息`}
                      >
                        <span>图片</span>
                        <a
                          href={selected.photo.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`查看${selected.name.zhHans}图片原始文件页，作者${selected.photo.author}`}
                        >
                          {selected.photo.author}
                        </a>
                        <a
                          href={selected.photo.licenseUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`查看${selected.name.zhHans}图片许可${selected.photo.license}`}
                        >
                          {selected.photo.license}
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              ) : (
                <div className={styles.selectedDetail} aria-live="polite">
                  <span className={styles.selectedIcon} aria-hidden="true">
                    <MapPin strokeWidth={1.8} />
                  </span>
                  <div className={styles.selectedCopy}>
                    <div className={styles.selectedHeading}>
                      <strong>{selected.name.zhHans}</strong>
                      <small>{selected.name.en}</small>
                    </div>
                    <div className={styles.selectedMeta}>
                      <span>{selectedLocation}</span>
                      <span>{selected.category.name.zhHans}</span>
                    </div>
                    <p className={styles.selectedDescription}>{selected.description}</p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className={styles.globeFrame}>
            <GlobeErrorBoundary resetSignal={retrySignal} onError={handleError}>
              <GlobeCanvas
                key={retrySignal}
                activeLayer={activeLayer}
                selectedId={selectedId}
                rotating={rotating}
                reducedMotion={reducedMotion}
                resetSignal={resetSignal}
                retrySignal={retrySignal}
                onSelect={handleSelectPlace}
                onReady={handleReady}
                onError={handleError}
              />
            </GlobeErrorBoundary>

            {runtimeState === 'loading' && (
              <div className={styles.stateOverlay} role="status">
                <GlobeLoading />
                <span>正在绘制地球与路线</span>
              </div>
            )}

            {runtimeState === 'error' && (
              <div className={styles.stateOverlay} role="alert">
                <div className={styles.errorPanel}>
                  <AlertTriangle aria-hidden="true" />
                  <h2>3D 地球暂时无法显示</h2>
                  <p>{runtimeMessage}</p>
                  <button type="button" onClick={retry}>
                    重新加载
                  </button>
                </div>
              </div>
            )}

            <div className={styles.interactionHint}>
              <MousePointer2 aria-hidden="true" strokeWidth={1.7} />
              <span>拖动旋转，滚轮或双指缩放</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
