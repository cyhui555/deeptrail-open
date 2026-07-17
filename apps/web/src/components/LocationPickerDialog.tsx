'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, MapPinned, RefreshCw, Search, X } from 'lucide-react';
import { getAMapErrorCopy, useAMapLoader } from '@/hooks/useAMapLoader';
import { ModalDialog } from '@/components/ModalDialog';

/** 选点确认结果：经纬度 + 逆地理编码地址（可能为 null）。 */
export interface PickedLocation {
  lat: number;
  lng: number;
  /** 逆地理编码地址；反查失败时为 null，由调用方决定降级策略。 */
  address: string | null;
}

/** 小地图选点弹窗组件 Props */
interface Props {
  /** 是否显示弹窗 */
  open: boolean;
  /** 初始纬度；null 表示无初始点 */
  initialLat: number | null;
  /** 初始经度 */
  initialLng: number | null;
  /** 确认选点回调，返回经纬度 + 地址 */
  onConfirm: (loc: PickedLocation) => void;
  /** 取消回调 */
  onCancel: () => void;
}

/** 高德 PlaceSearch 返回的提示项（字段子集）。 */
interface SearchTip {
  id: string;
  name: string;
  /** 行政区划 + 地址文本 */
  district: string;
  /** 经纬度（POI 有，关键字提示可能为 null） */
  location: { lng: number; lat: number } | null;
}

/**
 * 高德小地图选点弹窗。
 *
 * <p>支持三种选点方式：
 * <ol>
 *   <li>搜索框输入地址/地名 → PlaceSearch 提示 → 点击结果定位并放置 marker</li>
 *   <li>点击地图任意位置 → 放置/移动 marker</li>
 *   <li>拖动已有 marker → 精细调整位置</li>
 * </ol>
 * <p>marker 放置后自动逆地理编码，将地址显示在地图下方供用户确认。
 * 组件卸载时自动调用 {@code map.destroy()} 释放资源。
 */
export function LocationPickerDialog({ open, initialLat, initialLng, onConfirm, onCancel }: Props) {
  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);
  const [address, setAddress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // 搜索相关状态
  const [keyword, setKeyword] = useState('');
  const [tips, setTips] = useState<SearchTip[]>([]);
  const [tipsOpen, setTipsOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tipsRef = useRef<HTMLUListElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const { loaded, error, retry } = useAMapLoader();

  // 同步 initialLat/initialLng 到内部状态（打开时）
  useEffect(() => {
    setLat(initialLat);
    setLng(initialLng);
    setAddress(null);
    setKeyword('');
    setTips([]);
    setTipsOpen(false);
  }, [initialLat, initialLng, open]);

  /**
   * 逆地理编码：经纬度 → 地址文本。
   *
   * <p>通过 /api/geocode 服务端代理，使用 AMAP_REST_KEY 调用高德 Web 服务 API。
   * 浏览器端 JS API key 没有 REST API 权限（INVALID_USER_SCODE），不能在前端直连。
   */
  const doReverseGeocode = useCallback(async (lngVal: number, latVal: number) => {
    setGeocoding(true);
    try {
      const resp = await fetch(
        `/api/geocode?lng=${lngVal}&lat=${latVal}`,
        { signal: AbortSignal.timeout(8000) },
      );
      const data = await resp.json();
      if (resp.ok && data?.address) {
        setAddress(data.address);
      } else {
        console.warn('[LocationPicker] 逆地理编码失败：', data?.error);
        setAddress(null);
      }
    } catch (err) {
      console.warn('[LocationPicker] 逆地理编码异常：', err);
      setAddress(null);
    } finally {
      setGeocoding(false);
    }
  }, []);

  // 放置或移动 marker 到指定坐标，并触发逆地理编码
  const placeOrMoveMarker = useCallback(
    (lngVal: number, latVal: number, addr: string | null) => {
      const AMap = (window as any).AMap;
      const map = mapRef.current;
      if (!AMap || !map) return;

      setLat(latVal);
      setLng(lngVal);

      if (!markerRef.current) {
        const marker = new AMap.Marker({
          position: [lngVal, latVal],
          draggable: true,
          cursor: 'move',
        });
        marker.on('dragend', (e: any) => {
          const nlng = e.lnglat.lng;
          const nlat = e.lnglat.lat;
          setLat(nlat);
          setLng(nlng);
          doReverseGeocode(nlng, nlat);
        });
        map.add(marker);
        markerRef.current = marker;
      } else {
        markerRef.current.setPosition([lngVal, latVal]);
      }

      // 地图视野移动到 marker
      map.setCenter([lngVal, latVal]);

      if (addr) {
        // 搜索结果自带地址，直接使用，不再反查
        setAddress(addr);
        setGeocoding(false);
      } else {
        doReverseGeocode(lngVal, latVal);
      }
    },
    [doReverseGeocode],
  );

  // 初始化地图
  useEffect(() => {
    if (!loaded || !open || !containerRef.current || mapRef.current) return;

    const AMap = (window as any).AMap;
    const centerLng = lng ?? 104.06;
    const centerLat = lat ?? 30.67;
    const map = new AMap.Map(containerRef.current, {
      zoom: 14,
      viewMode: '2D',
      center: [centerLng, centerLat],
    });
    mapRef.current = map;

    // 放置初始 marker
    if (lat != null && lng != null) {
      placeOrMoveMarker(lng, lat, null);
    }

    // 点击地图 → 移动或新增 marker
    map.on('click', (e: any) => {
      placeOrMoveMarker(e.lnglat.lng, e.lnglat.lat, null);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
    // lat/lng 由上方 useEffect 同步 initialLat/initialLng；本 effect 仅在 open/loaded 变化时重建地图
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, open]);

  /**
   * 搜索 POI 提示。
   *
   * <p>通过 /api/search-poi 服务端代理，避免浏览器端 AMap.PlaceSearch 插件权限问题。
   * 防抖 300ms 避免高频请求。
   *
   * @param value 用户输入的关键词
   * @param onResult 结果回调
   */
  const searchPois = useCallback(async (value: string, onResult: (tips: SearchTip[]) => void) => {
    try {
      const resp = await fetch(
        `/api/search-poi?keywords=${encodeURIComponent(value.trim())}&city=全国&limit=8`,
        { signal: AbortSignal.timeout(5000) },
      );
      const data = await resp.json();
      onResult(data?.tips || []);
    } catch (err) {
      console.warn('[LocationPicker] 搜索 POI 失败：', err);
      onResult([]);
    }
  }, []);

  // 搜索输入变化 → 防抖调用 /api/search-poi
  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    setTipsOpen(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!value.trim()) {
      setTips([]);
      setTipsOpen(false);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      searchPois(value, (tips) => {
        setTips(tips);
      });
    }, 300);
  };

  /**
   * 阻止搜索框内按 Enter 触发表单提交。
   *
   * <p>LocationPickerDialog 嵌在 AddCustomItemModal 的 {@code <form>} 内，
   * 输入框内回车默认会 submit 表单 → 导致"名称搜索直接跳转出去"的体验 bug。
   * 如果当前有可见的搜索结果，Enter 改为选中第一条 tip。
   */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (tips.length > 0) {
        handleSelectTip(tips[0]);
      }
    } else if (e.key === 'Escape') {
      setTipsOpen(false);
    }
  };

  // 选中搜索提示项 → 定位到该 POI
  const handleSelectTip = (tip: SearchTip) => {
    setTips([]);
    setTipsOpen(false);
    setKeyword(tip.name);
    if (tip.location) {
      const fullAddr = tip.district
        ? `${tip.district}${tip.name}`.replace(/^(未知)/, '')
        : tip.name;
      placeOrMoveMarker(tip.location.lng, tip.location.lat, fullAddr);
    }
  };

  // 点击输入框外部 → 关闭提示下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tipsRef.current &&
        !tipsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setTipsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!open) return null;

  return (
    <ModalDialog
      open={open}
      onClose={onCancel}
      labelledBy="location-picker-title"
      describedBy="location-picker-coordinates"
      overlayClassName="z-[60]"
      panelClassName="max-w-md overflow-visible"
    >
      {/*
       * 注意：不要在此处加 overflow-hidden。
       * 搜索提示下拉（absolute + top-full）会溢出卡片边界，
       * overflow-hidden 会裁掉它，导致点击 tip 时事件落到 backdrop 上误关闭对话框。
       */}
      <div>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 id="location-picker-title" className="text-base font-semibold text-gray-900">在地图上选点</h3>
          <button type="button" onClick={onCancel} className="grid min-h-10 min-w-10 place-items-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="关闭地图选点弹窗">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* 搜索框 */}
          <div className="relative">
            <label htmlFor="location-picker-search" className="sr-only">搜索地址或地名</label>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                id="location-picker-search"
                data-autofocus
                ref={inputRef}
                type="text"
                value={keyword}
                onChange={(e) => handleKeywordChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => tips.length > 0 && setTipsOpen(true)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                placeholder="搜索地址或地名"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => {
                    setKeyword('');
                    setTips([]);
                    setTipsOpen(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                  aria-label="清空搜索"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* 搜索提示下拉 */}
            {tipsOpen && tips.length > 0 && (
              <ul
                ref={tipsRef}
                className="absolute left-0 right-0 top-full mt-1 z-10 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
              >
                {tips.map((tip) => (
                  <li key={tip.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectTip(tip)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 active:bg-blue-100 transition-colors border-b border-gray-50 last:border-b-0"
                    >
                      <div className="text-sm text-gray-800 truncate">{tip.name}</div>
                      {tip.district && (
                        <div className="text-xs text-gray-400 truncate">{tip.district}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 地图容器 320px */}
          {loaded ? (
            <div
              ref={containerRef}
              className="w-full h-80 rounded-lg overflow-hidden border border-gray-200"
            />
          ) : error ? (
            <div className="flex h-80 w-full items-center justify-center rounded-lg bg-gray-50 px-5 text-gray-500">
              <div className="max-w-xs space-y-2 text-center">
                <MapPinned aria-hidden="true" className="mx-auto h-7 w-7 text-primary-700" strokeWidth={1.7} />
                <p className="text-sm font-semibold text-gray-700">{getAMapErrorCopy(error).title}</p>
                <p className="text-xs leading-5 text-gray-500">{getAMapErrorCopy(error).description}</p>
                <button type="button" onClick={retry} className="button-secondary mx-auto min-h-0 gap-1.5 px-3 py-2 text-xs">
                  <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                  重新加载地图
                </button>
              </div>
            </div>
          ) : (
            <div role="status" className="w-full h-80 flex items-center justify-center text-sm text-gray-500 bg-gray-50 rounded-lg">
              地图加载中...
            </div>
          )}

          {/* 地址预览（逆地理编码结果） */}
          <div className="min-h-[2.25rem] flex items-center gap-2">
            {geocoding ? (
              <span role="status" className="text-xs text-primary-700 animate-pulse">地址反查中…</span>
            ) : address ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-gray-600" title={address}>
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-700" />
                <span className="truncate">{address}</span>
              </span>
            ) : lat != null && lng != null ? (
              <span className="text-xs text-gray-400">地址反查失败，可手动在表单中填写</span>
            ) : null}
          </div>

          {/* 当前坐标 */}
          <div id="location-picker-coordinates" className="text-xs text-gray-500 font-mono">
            当前：{lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '未选点'}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (lat != null && lng != null) {
                onConfirm({ lat, lng, address });
              }
            }}
            disabled={lat == null || lng == null}
            className="button-primary min-h-0 flex-1 px-3 py-2"
          >
            确认选点
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
