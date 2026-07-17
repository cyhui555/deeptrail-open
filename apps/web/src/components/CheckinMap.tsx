'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { MapPinned, RefreshCw } from 'lucide-react';
import { getAMapErrorCopy, useAMapLoader } from '@/hooks/useAMapLoader';
import { getPeriodStyle } from '@/components/ItineraryTimeline';
import { getValidItemCoordinate } from '@/lib/coordinates';
import type { CheckinItem, TrackPoint } from '@/types';

interface CheckinMapProps {
  /** 打卡项列表（用于显示标记点和路线） */
  items: CheckinItem[];
  /** GPS 轨迹点（可选） */
  trackPoints?: TrackPoint[];
  /** 路线显示模式 */
  routeMode?: 'planned' | 'actual' | 'gps' | 'all';
  /** 标记点拖动结束回调 */
  onMarkerDragEnd?: (itemId: number, lat: number, lng: number) => void;
  /** 标记点点击回调 */
  onMarkerClick?: (itemId: number) => void;
  /** 鼠标悬停标记点时是否自动打开 InfoWindow 详情卡片（全部行程页用） */
  showInfoWindowOnHover?: boolean;
  /** 高亮项 ID（联动用） */
  highlightItemId?: number | null;
  /** 地图高度 */
  height?: string;
  /**
   * 自定义每段路线的颜色。
   *
   * <p>默认使用旅迹矿物蓝主色；全局模式下可按天传入低饱和路线色。
   * 入参为该段起点、终点 item（含 dayNumber 等上下文可供父级判断所属天）。
   */
  getSegmentColor?: (from: CheckinItem, to: CheckinItem) => string | null;
}

export interface CheckinMapHandle {
  setCenter: (lat: number, lng: number) => void;
  highlightMarker: (itemId: number) => void;
  /** 在指定 itemId 的标记处打开信息卡片；找不到时静默忽略。 */
  showInfoWindow: (itemId: number) => void;
  /**
   * 获取当前地图快照的 base64 PNG 数据 URL。
   *
   * <p>通过读取地图容器内 canvas 元素的 {@link HTMLCanvasElement.toDataURL} 实现。
   * 地图未加载、容器内无 canvas、或 canvas 被跨域瓦片污染时抛出异常，
   * 调用方应捕获异常并降级为"无地图封面"。
   */
  getSnapshot: () => Promise<string>;
}

/**
 * 打卡点高德地图组件。
 *
 * <p>展示 POI 标记点、计划路线（蓝色虚线）、实际路线（绿色实线）、GPS 轨迹（红色细线）。
 * 支持标记点拖动修正坐标，通过 useImperativeHandle 暴露 setCenter 方法供外部联动。
 */
export const CheckinMap = forwardRef<CheckinMapHandle, CheckinMapProps>(function CheckinMap(
  { items, trackPoints = [], routeMode = 'planned', onMarkerDragEnd, onMarkerClick, showInfoWindowOnHover, highlightItemId, height = '60vh', getSegmentColor },
  ref
) {
  const { loaded, error, retry } = useAMapLoader();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<number, any>>(new Map());
  const polylinesRef = useRef<any[]>([]);
  const routeLabelsRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const initialViewFittedRef = useRef(false);
  const fitViewFrameRef = useRef<number | null>(null);
  const fittedCoverageRef = useRef(0);
  const latestVisibleCoverageRef = useRef(0);
  const userAdjustedViewportRef = useRef(false);
  const lastRouteModeRef = useRef(routeMode);
  const itemsRef = useRef<CheckinItem[]>([]);
  itemsRef.current = items;

  // 交通工具 emoji 映射
  const transportEmoji: Record<string, string> = useMemo(() => ({
    WALK: '🚶', DRIVE: '🚗', BUS: '🚌', SUBWAY: '🚇', TRAIN: '🚆', FLIGHT: '✈️',
  }), []);

  /** 解析 transportToNext JSON 字符串。 */
  const parseTransport = useCallback(
    (raw: string | null | undefined): { mode: string; durationMin: number; description: string } | null => {
      if (!raw) return null;
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && obj.mode) {
          return { mode: String(obj.mode), durationMin: Number(obj.durationMin) || 0, description: String(obj.description || '') };
        }
      } catch { /* 格式退化：忽略 */ }
      return null;
    }, [],
  );

  /**
   * 在容器完成布局后适配当前覆盖物；双帧等待避免真实高德地图尚未计算出容器尺寸。
   * 用户已操作地图时，后台轨迹或坐标更新不再抢夺视野；主动切换路线模式可强制适配。
   */
  const scheduleViewportFit = useCallback((coverage: number, force = false) => {
    if (!mapRef.current || (!force && userAdjustedViewportRef.current)) return;
    if (fitViewFrameRef.current !== null) {
      window.cancelAnimationFrame(fitViewFrameRef.current);
    }
    fitViewFrameRef.current = window.requestAnimationFrame(() => {
      fitViewFrameRef.current = window.requestAnimationFrame(() => {
        fitViewFrameRef.current = null;
        const map = mapRef.current;
        if (!map || (!force && userAdjustedViewportRef.current)) return;
        const overlays = [
          ...Array.from(markersRef.current.values()),
          ...polylinesRef.current,
        ];
        if (overlays.length === 0) return;
        // 高德地图在父容器刚从加载态切换时可能仍持有旧尺寸，先刷新尺寸再适配。
        map.resize?.();
        map.setFitView(overlays, false, [40, 40, 40, 40]);
        initialViewFittedRef.current = true;
        fittedCoverageRef.current = coverage;
      });
    });
  }, []);

  /** 构造 marker 图标的 HTML content（始终显示序号，状态仅影响配色）。 */
  const buildMarkerContent = (seq: number, status: CheckinItem['status']): string => {
    const isChecked = status === 'CHECKED_IN';
    const bg = isChecked ? '#22c55e' : '#f97316';
    const checkBadge = isChecked
      ? `<div style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;` +
        `background:#fff;display:flex;align-items:center;justify-content:center;` +
        `box-shadow:0 1px 2px rgba(0,0,0,0.3);` +
        `font-size:9px;color:#22c55e;font-weight:900;line-height:1;">✓</div>`
      : '';
    return (
      `<div style="position:relative;width:28px;height:28px;">` +
        `<div style="width:28px;height:28px;border-radius:50%;background:${bg};` +
          `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);` +
          `display:flex;align-items:center;justify-content:center;` +
          `color:#fff;font-size:13px;font-weight:700;line-height:1;">${seq}</div>${checkBadge}` +
      `</div>`
    );
  };

  /** 构造 InfoWindow 的 HTML 内容（小卡片样式行程详情）。 */
  const buildInfoWindowContent = (item: CheckinItem): string => {
    const periodStyle = item.period
      ? (() => {
          const ps = getPeriodStyle(item.period);
          return `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:${ps.bgColor};border:1px solid ${ps.borderColor};margin-bottom:8px;">` +
            `<span style="font-size:16px;">${ps.icon}</span>` +
            `<span style="font-size:12px;font-weight:600;color:${ps.color};">${item.period}</span>` +
            `</div>`;
        })()
      : '';

    const desc = item.description
      ? `<p style="margin:0 0 8px;font-size:13px;color:#5d4f40;line-height:1.5;">${escapeHtml(item.description)}</p>`
      : '';

    const infoTags = [
      item.poiAddress ? `📍 ${escapeHtml(item.poiAddress)}` : '',
      item.category ? `<span style="background:#f4eee5;padding:1px 6px;border-radius:4px;">${escapeHtml(item.category)}</span>` : '',
      item.rating ? `<span style="color:#d97706;">★ ${escapeHtml(item.rating)}</span>` : '',
      item.openingHours ? `🕐 ${escapeHtml(item.openingHours)}` : '',
      item.admissionFee ? `🎫 ${escapeHtml(item.admissionFee)}` : '',
      item.estimatedCost ? `💰 ${escapeHtml(item.estimatedCost)}` : '',
      item.estimatedVisitTime ? `⏱ ${escapeHtml(item.estimatedVisitTime)}` : '',
      item.phone ? `📞 ${escapeHtml(item.phone)}` : '',
    ].filter(Boolean);
    const infoRow = infoTags.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;font-size:11px;color:#776754;">${infoTags.join('')}</div>`
      : '';

    const statusBadge =
      item.status === 'CHECKED_IN'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:600;">✓ 已打卡</span>`
        : item.status === 'ABANDONED'
          ? `<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:600;">已放弃</span>`
          : `<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#f4eee5;color:#776754;font-size:11px;font-weight:600;">○ 未打卡</span>`;

    const checkedInfo =
      item.status === 'CHECKED_IN' && item.checkedInAt
        ? `<div style="margin-top:6px;padding:6px 8px;background:#f0fdf4;border-radius:6px;font-size:11px;color:#166534;">🕐 ${new Date(item.checkedInAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>`
        : '';

    return (
      `<div style="min-width:200px;max-width:260px;font-family:system-ui,-apple-system,sans-serif;">` +
        `<h3 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#211c17;">${escapeHtml(item.poiName)}</h3>` +
        `<div style="margin-bottom:6px;">${statusBadge}</div>` +
        periodStyle +
        desc +
        infoRow +
        checkedInfo +
      `</div>`
    );
  };

  /** 转义 HTML 特殊字符防止 XSS。 */
  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lng: number) => {
      if (mapRef.current) {
        mapRef.current.setCenter([lng, lat]);
      }
    },
    highlightMarker: (itemId: number) => {
      const marker = markersRef.current.get(itemId);
      if (marker && mapRef.current) {
        mapRef.current.setCenter(marker.getPosition());
      }
    },
    showInfoWindow: (itemId: number) => {
      const marker = markersRef.current.get(itemId);
      const item = items.find((i) => i.id === itemId);
      if (marker && item && mapRef.current && infoWindowRef.current) {
        infoWindowRef.current.setContent(buildInfoWindowContent(item));
        infoWindowRef.current.open(mapRef.current, marker.getPosition());
      }
    },
    getSnapshot: () => {
      return new Promise<string>((resolve, reject) => {
        if (!mapRef.current) {
          reject(new Error('地图未初始化'));
          return;
        }
        // 高德地图将瓦片渲染到容器内的 canvas 元素
        const container = containerRef.current;
        const canvas = container?.querySelector('canvas');
        if (!canvas) {
          reject(new Error('地图画布不存在'));
          return;
        }
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          // 跨域瓦片污染 canvas 时会抛 SecurityError
          reject(new Error(`地图截图失败：${e instanceof Error ? e.message : String(e)}`));
        }
      });
    },
  }));

  // 初始化地图
  useEffect(() => {
    if (!loaded || !containerRef.current || mapRef.current) return;

    const AMap = (window as any).AMap;
    const map = new AMap.Map(containerRef.current, {
      zoom: 14,
      viewMode: '3D',
    });
    mapRef.current = map;
    initialViewFittedRef.current = false;
    fittedCoverageRef.current = 0;
    latestVisibleCoverageRef.current = 0;
    userAdjustedViewportRef.current = false;
    const markers = markersRef.current;
    const polylines = polylinesRef.current;
    const container = containerRef.current;

    const handleUserInteraction = () => {
      userAdjustedViewportRef.current = true;
    };
    const handleMapComplete = () => {
      if (!initialViewFittedRef.current) {
        scheduleViewportFit(latestVisibleCoverageRef.current);
      }
    };
    container.addEventListener('pointerdown', handleUserInteraction);
    container.addEventListener('wheel', handleUserInteraction, { passive: true });
    map.on?.('complete', handleMapComplete);

    // 创建共享 InfoWindow 实例
    infoWindowRef.current = new AMap.InfoWindow({
      offset: new AMap.Pixel(0, -10),
      autoMove: true,
      closeWhenClickMap: true,
    });

    return () => {
      if (fitViewFrameRef.current !== null) {
        window.cancelAnimationFrame(fitViewFrameRef.current);
        fitViewFrameRef.current = null;
      }
      container.removeEventListener('pointerdown', handleUserInteraction);
      container.removeEventListener('wheel', handleUserInteraction);
      map.off?.('complete', handleMapComplete);
      map.destroy();
      mapRef.current = null;
      markers.clear();
      polylines.length = 0;
      infoWindowRef.current = null;
      initialViewFittedRef.current = false;
      fittedCoverageRef.current = 0;
      latestVisibleCoverageRef.current = 0;
      userAdjustedViewportRef.current = false;
    };
  }, [loaded, scheduleViewportFit]);

  // 每次渲染同步最新回调到 ref，避免 markers useEffect 依赖回调导致打卡后整体重建
  const onMarkerDragEndRef = useRef(onMarkerDragEnd);
  const onMarkerClickRef = useRef(onMarkerClick);
  const showInfoWindowOnHoverRef = useRef(showInfoWindowOnHover);
  onMarkerDragEndRef.current = onMarkerDragEnd;
  onMarkerClickRef.current = onMarkerClick;
  showInfoWindowOnHoverRef.current = showInfoWindowOnHover;

  // 内容签名：每一项 id + status + displayLat/Lng 的组合字符串。
  // 当后端轮询仅刷新引用而内容未变时，签名不变，避免 markers 整体销毁重建（解决 BUG-20260702-004/005）。
  const itemsSignature = useMemo(() => {
    return items
      .map((i) => `${i.id}:${i.status}:${i.displayLat ?? i.poiLat}:${i.displayLng ?? i.poiLng}`)
      .join('|');
  }, [items]);

  // 更新标记点（增量同步：新增的创建、移除的删除、已有的保留；避免全量销毁重建）
  useEffect(() => {
    if (!mapRef.current) return;
    const AMap = (window as any).AMap;
    const map = mapRef.current;

    // 本次应存在的 marker id 集合（排除 ABANDONED 和无效坐标的项）
    const wantedIds = new Set<number>();
    const wanted = items.filter((i) => {
      if (i.status === 'ABANDONED') return false;
      if (!getValidItemCoordinate(i)) return false;
      wantedIds.add(i.id);
      return true;
    });

    // 1) 移除不再需要的 marker
    const toRemove: number[] = [];
    markersRef.current.forEach((_, id) => {
      if (!wantedIds.has(id)) toRemove.push(id);
    });
    toRemove.forEach((id) => {
      const m = markersRef.current.get(id);
      if (m) map.remove(m);
      markersRef.current.delete(id);
    });

    // 2) 更新已有 marker 的坐标（force-refill 等场景下坐标会变，需同步到地图）
    // 注意：wanted 已过滤掉 null/undefined 坐标，此处 lat/lng 必为 number（TS 无法推断，需断言）
    let movedCount = 0;
    wanted.forEach((item) => {
      const marker = markersRef.current.get(item.id);
      if (!marker) return;
      const coordinate = getValidItemCoordinate(item);
      if (!coordinate) return;
      const { lat, lng } = coordinate;
      const curLnglat = marker.getPosition();
      const curLat = curLnglat?.lat;
      const curLng = curLnglat?.lng;
      // 仅在坐标真正变化时才 setPosition，避免无谓的重绘
      if (curLat == null || curLng == null
          || Math.abs(curLat - lat) > 1e-6 || Math.abs(curLng - lng) > 1e-6) {
        marker.setPosition([lng, lat]);
        movedCount++;
      }
    });

    // 3) 仅创建新增的 marker（已有的保留原位不动，避免闪烁 / 视野跳回）
    // 按 display 顺序建立序号表（仅包含 wanted 中的项，排除 ABANDONED + 无坐标）
    const seqById = new Map<number, number>();
    wanted.forEach((item, idx) => { seqById.set(item.id, idx + 1); });

    wanted.forEach((item) => {
      if (markersRef.current.has(item.id)) return;
      const coordinate = getValidItemCoordinate(item);
      if (!coordinate) return;
      const { lat, lng } = coordinate;
      const seq = seqById.get(item.id) ?? 1;

      const marker = new AMap.Marker({
        position: [lng, lat],
        content: buildMarkerContent(seq, item.status),
        title: item.poiName,
        draggable: true,
        cursor: 'move',
        offset: new AMap.Pixel(-14, -14),
      });
      // 将序号与当前 status 挂载到 marker 实例，供后续图标就地更新复用
      (marker as any).__seq = seq;
      (marker as any).__status = item.status;

      marker.on('click', () => {
        onMarkerClickRef.current?.(item.id);
      });
      // 悬停展示 InfoWindow（全部行程页启用）
      marker.on('mouseover', () => {
        if (!showInfoWindowOnHoverRef.current) return;
        const currentItem = itemsRef.current.find((i) => i.id === item.id);
        if (currentItem && infoWindowRef.current && mapRef.current) {
          infoWindowRef.current.setContent(buildInfoWindowContent(currentItem));
          infoWindowRef.current.open(mapRef.current, marker.getPosition());
        }
      });
      marker.on('mouseout', () => {
        if (infoWindowRef.current) infoWindowRef.current.close();
      });
      marker.on('dragend', (e: any) => {
        const newLat = e.lnglat.lat;
        const newLng = e.lnglat.lng;
        onMarkerDragEndRef.current?.(item.id, newLat, newLng);
      });

      map.add(marker);
      markersRef.current.set(item.id, marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature, loaded]);

  // 打卡状态变化时就地更新已有 marker 图标，避免销毁重建导致闪烁/视野跳回
  useEffect(() => {
    if (!mapRef.current) return;
    items.forEach((item) => {
      const marker = markersRef.current.get(item.id);
      if (!marker) return;
      const prevStatus = (marker as any).__status;
      if (prevStatus === item.status) return; // 未变化，跳过
      const seq = (marker as any).__seq ?? 1;
      marker.setContent(buildMarkerContent(seq, item.status));
      (marker as any).__status = item.status;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature]);

  // 更新路线 + 交通工具文字标注
  useEffect(() => {
    if (!mapRef.current) return;
    const AMap = (window as any).AMap;
    const map = mapRef.current;

    // 清除旧路线与标注
    polylinesRef.current.forEach((p) => map.remove(p));
    polylinesRef.current = [];
    routeLabelsRef.current.forEach((t) => map.remove(t));
    routeLabelsRef.current = [];

    const showPlanned = routeMode === 'planned' || routeMode === 'all';
    const showActual = routeMode === 'actual' || routeMode === 'all';
    const showGps = routeMode === 'gps' || routeMode === 'all';

    /**
     * 将打卡项转换为 [lng, lat] 坐标对。
     * <p>统一在此处做 null/undefined/NaN 校验，过滤与映射使用相同的回退逻辑，
     * 避免 filter 通过后 map 产生 [null, null] 导致高德 SDK Polyline 内部崩溃。
     * <p>本产品不涉及非洲业务，AI 检索失败时会出现 (0, 0) 伪坐标（Null Island / 几内亚湾），
     * 此处一并剔除以避免幽灵标记。
     */
    const toCoord = (i: CheckinItem): [number, number] | null => {
      const coordinate = getValidItemCoordinate(i);
      return coordinate ? [coordinate.lng, coordinate.lat] : null;
    };

    /**
     * 在路线段中点添加交通工具标注（AMap.Text）。
     *
     * @param from 起点 POI 项
     * @param a 起点坐标 [lng, lat]
     * @param b 终点坐标 [lng, lat]
     */
    const addTransportLabel = (from: CheckinItem, a: [number, number], b: [number, number]) => {
      const t = parseTransport(from.transportToNext);
      if (!t) return;
      const midLng = (a[0] + b[0]) / 2;
      const midLat = (a[1] + b[1]) / 2;
      const emoji = transportEmoji[t.mode] || '➡️';
      const label = new AMap.Text({
        position: [midLng, midLat],
        text: `${emoji} ${t.description || t.mode}`,
        anchor: 'center',
        offset: new AMap.Pixel(0, -14),
        style: {
          'background-color': '#fffaf3',
          'border-radius': '10px',
          'padding': '2px 6px',
          'font-size': '11px',
          'color': '#5d4f40',
          'box-shadow': '0 1px 3px rgba(0,0,0,0.15)',
          'white-space': 'nowrap',
          'border': '1px solid #ddcdb8',
        },
      });
      map.add(label);
      routeLabelsRef.current.push(label);
    };

    // 计划路线：按 items 数组顺序逐段绘制（方便逐段着色 + 逐段标注交通工具），虚线
    if (showPlanned) {
      for (let idx = 0; idx < items.length - 1; idx++) {
        const a = toCoord(items[idx]);
        const b = toCoord(items[idx + 1]);
        if (!a || !b) continue;
        const seg = items[idx + 1].status === 'ABANDONED' ? null : items[idx];
        const color = (seg && getSegmentColor?.(seg, items[idx + 1])) || '#2b6595';
        const polyline = new AMap.Polyline({
          path: [a, b],
          strokeColor: color,
          strokeWeight: 4,
          strokeStyle: 'dashed',
          strokeDasharray: [10, 5],
        });
        map.add(polyline);
        polylinesRef.current.push(polyline);

        // 仅当两端均未废弃且前段有交通工具信息时才标注
        if (items[idx].status !== 'ABANDONED' && items[idx + 1].status !== 'ABANDONED') {
          addTransportLabel(items[idx], a, b);
        }
      }
    }

    // 实际路线：过滤 CHECKED_IN，按 checkedInAt 排序，绿色实线
    if (showActual) {
      const checkedIn = items
        .filter((i) => i.status === 'CHECKED_IN')
        .sort((a, b) => {
          const timeA = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
          const timeB = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
          return timeA - timeB;
        });
      // 实际路线同样逐段绘制并标注
      for (let idx = 0; idx < checkedIn.length - 1; idx++) {
        const a = toCoord(checkedIn[idx]);
        const b = toCoord(checkedIn[idx + 1]);
        if (!a || !b) continue;
        const polyline = new AMap.Polyline({
          path: [a, b],
          strokeColor: '#22c55e',
          strokeWeight: 5,
          strokeStyle: 'solid',
        });
        map.add(polyline);
        polylinesRef.current.push(polyline);
        addTransportLabel(checkedIn[idx], a, b);
      }
    }

    // GPS 轨迹：使用 trackPoints，红色细线
    if (showGps && trackPoints.length >= 2) {
      const gpsPath = trackPoints
        .slice()
        .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
        .map((p): [number, number] | null => {
          if (p.longitude == null || p.latitude == null) return null;
          if (!Number.isFinite(p.longitude) || !Number.isFinite(p.latitude)) return null;
          return [p.longitude, p.latitude];
        })
        .filter((c): c is [number, number] => c !== null);
      if (gpsPath.length >= 2) {
        const polyline = new AMap.Polyline({
          path: gpsPath,
          strokeColor: '#ef4444',
          strokeWeight: 2,
          strokeStyle: 'solid',
          strokeOpacity: 0.7,
        });
        map.add(polyline);
        polylinesRef.current.push(polyline);
      }
    }

    const routeModeChanged = lastRouteModeRef.current !== routeMode;
    lastRouteModeRef.current = routeMode;
    if (routeModeChanged) {
      // 主动切换路线模式代表用户希望立即查看所选范围，重新允许一次自动适配。
      userAdjustedViewportRef.current = false;
    }
    const visibleCoverage = markersRef.current.size
      + polylinesRef.current.length * 2
      + (showGps ? trackPoints.length : 0);
    latestVisibleCoverageRef.current = visibleCoverage;
    if (!initialViewFittedRef.current
        || routeModeChanged
        || visibleCoverage > fittedCoverageRef.current) {
      scheduleViewportFit(visibleCoverage, routeModeChanged);
    }
  }, [items, trackPoints, routeMode, getSegmentColor, parseTransport, transportEmoji, loaded, scheduleViewportFit]);

  // 高亮效果：高亮项的标记放大
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((marker, itemId) => {
      if (highlightItemId === itemId) {
        marker.setTop(true);
        mapRef.current.setCenter(marker.getPosition());
      } else {
        marker.setTop(false);
      }
    });
  }, [highlightItemId, loaded]);

  if (error) {
    const copy = getAMapErrorCopy(error);
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500"
        style={{ height }}
      >
        <div className="max-w-xs space-y-2 px-5 text-center">
          <MapPinned aria-hidden="true" className="mx-auto h-7 w-7 text-primary-700" strokeWidth={1.7} />
          <p className="text-sm font-semibold text-gray-700">{copy.title}</p>
          <p className="text-xs leading-5 text-gray-500">{copy.description}</p>
          <button type="button" onClick={retry} className="button-secondary mx-auto min-h-0 gap-1.5 px-3 py-2 text-xs">
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            重新加载地图
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50"
        style={{ height }}
      >
        <div className="text-center space-y-2">
          <MapPinned aria-hidden="true" className="mx-auto h-7 w-7 animate-pulse text-primary-600" strokeWidth={1.7} />
          <p className="text-sm text-gray-500">地图加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-gray-200"
      style={{ height }}
    />
  );
});
