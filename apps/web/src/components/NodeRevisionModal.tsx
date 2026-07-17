'use client';

import { useEffect, useMemo, useState } from 'react';
import type { NodeRevision, SaveNodeRevisionRequest, TransportMode } from '@/types';
import { LocationPickerDialog } from '@/components/LocationPickerDialog';
import type { PickedLocation } from '@/components/LocationPickerDialog';

/** 交通工具 emoji 映射（与 CheckinMap 一致）。 */
const TRANSPORT_EMOJI: Record<TransportMode, string> = {
  WALK: '🚶', DRIVE: '🚗', BUS: '🚌', SUBWAY: '🚇', TRAIN: '🚆', FLIGHT: '✈️',
};

const TRANSPORT_LABEL: Record<TransportMode, string> = {
  WALK: '步行', DRIVE: '驾车', BUS: '公交', SUBWAY: '地铁', TRAIN: '火车', FLIGHT: '飞机',
};

const ALL_MODES: TransportMode[] = ['WALK', 'DRIVE', 'BUS', 'SUBWAY', 'TRAIN', 'FLIGHT'];

interface TransportData {
  mode: TransportMode;
  durationMin: number;
  description: string;
}

interface Props {
  open: boolean;
  /** 天序号（从 1 开始，用于接口请求）。 */
  dayIndex: number;
  /** 时段序号（从 0 开始，用于接口请求）。 */
  itemIndex: number;
  /** 已持久化的修正（编辑模式）。undefined = 新建模式。 */
  initial?: NodeRevision | null;
  /** AI 原始纬度。 */
  originalLat?: number | null;
  /** AI 原始经度。 */
  originalLng?: number | null;
  /** AI 原始交通数据（解析后的对象）。 */
  originalTransport?: TransportData | null;
  saving?: boolean;
  /** 保存错误信息。 */
  saveError?: string | null;
  onSave: (req: SaveNodeRevisionRequest) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * 节点修正弹窗（双 tab：地理坐标 / 交通衔接）。
 *
 * <p>草稿本地维护，仅在点击"保存"时提交；关闭弹窗不丢失草稿需由调用方保持草稿态。
 * 保存按钮在本组件内判定：草稿与持久化值等价时禁用。
 */
export function NodeRevisionModal({
  open,
  dayIndex,
  itemIndex,
  initial,
  originalLat,
  originalLng,
  originalTransport,
  saving = false,
  saveError,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'geo' | 'transport'>('geo');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [mode, setMode] = useState<TransportMode>('WALK');
  const [duration, setDuration] = useState<string>('');
  const [desc, setDesc] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // 弹窗打开时，从 initial（持久化值）初始化草稿
  useEffect(() => {
    if (open) {
      setTab('geo');
      setLat(initial?.correctedLat != null ? String(initial.correctedLat) : '');
      setLng(initial?.correctedLng != null ? String(initial.correctedLng) : '');
      setMode(initial?.transportMode ?? 'WALK');
      setDuration(initial?.transportDuration != null ? String(initial.transportDuration) : '');
      setDesc(initial?.transportDesc ?? '');
      setPickerOpen(false);
    }
  }, [open, initial]);

  /** 地图选点确认：回填经纬度和地址（对话框内部已完成逆地理编码） */
  const handlePickConfirm = (loc: PickedLocation) => {
    setLat(String(loc.lat));
    setLng(String(loc.lng));
    if (loc.address) setAddress(loc.address);
    setPickerOpen(false);
  };

  // 地理：lat/lng 要么都空要么都填
  const geoPairError = useMemo(() => {
    const hasLat = lat.trim() !== '';
    const hasLng = lng.trim() !== '';
    if (hasLat && !hasLng) return '纬度与经度必须同时填写';
    if (!hasLat && hasLng) return '纬度与经度必须同时填写';
    if (hasLat && hasLng) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) return '纬度范围 -90 ~ 90';
      if (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) return '经度范围 -180 ~ 180';
    }
    return null;
  }, [lat, lng]);

  // 草稿与持久化值是否等价（用于禁用保存按钮）
  const isPristine = useMemo(() => {
    const draftLat = lat.trim() === '' ? null : Number(lat);
    const draftLng = lng.trim() === '' ? null : Number(lng);
    const draftDur = duration.trim() === '' ? null : Number(duration);
    const draftDesc = desc.trim() === '' ? null : desc.trim();

    const initLat = initial?.correctedLat ?? null;
    const initLng = initial?.correctedLng ?? null;
    const initMode = initial?.transportMode ?? null;
    const initDur = initial?.transportDuration ?? null;
    const initDesc = initial?.transportDesc ?? null;

    return (
      draftLat === initLat &&
      draftLng === initLng &&
      mode === initMode &&
      draftDur === initDur &&
      draftDesc === initDesc
    );
  }, [lat, lng, mode, duration, desc, initial]);

  const geoDirty = lat.trim() !== '' || lng.trim() !== '';
  const transportDirty = mode !== (initial?.transportMode ?? 'WALK') ||
    duration.trim() !== '' ||
    desc.trim() !== '';

  if (!open) return null;

  const handleSave = () => {
    const req: SaveNodeRevisionRequest = {
      dayIndex,
      itemIndex,
    };
    // 地理坐标：有草稿就传，传 null 表示"无修正"
    if (lat.trim() !== '' && lng.trim() !== '') {
      req.correctedLat = Number(lat);
      req.correctedLng = Number(lng);
    }
    // 交通：任一子字段有值就传
    if (mode || duration.trim() !== '' || desc.trim() !== '') {
      req.transportMode = mode;
      req.transportDuration = duration.trim() === '' ? null : Number(duration);
      req.transportDesc = desc.trim() === '' ? null : desc.trim();
    }
    onSave(req);
  };

  const fmtCoord = (v: number | null | undefined) => (v != null ? v.toFixed(6) : '未设置');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text">修正行程节点</h3>
            <button
              onClick={onClose}
              className="text-text-subtle hover:text-text-muted text-lg leading-none px-1"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-text-subtle mt-1">
            第 <span className="num-lining">{dayIndex}</span> 天 · 第 <span className="num-lining">{itemIndex + 1}</span> 个行程点
          </p>
        </div>

        {/* 错误信息 banner */}
        {saveError && (
          <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-danger-light text-xs text-danger border border-danger/20">
            {saveError}
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex border-b border-border mt-3">
          <button
            onClick={() => setTab('geo')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === 'geo' ? 'text-jade' : 'text-text-muted hover:text-text'
            }`}
          >
            地理坐标
            {geoDirty && (
              <span className="absolute top-2 right-4 w-1.5 h-1.5 rounded-full bg-jade" />
            )}
          </button>
          <button
            onClick={() => setTab('transport')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === 'transport' ? 'text-jade' : 'text-text-muted hover:text-text'
            }`}
          >
            交通衔接
            {transportDirty && (
              <span className="absolute top-2 right-4 w-1.5 h-1.5 rounded-full bg-jade" />
            )}
          </button>
        </div>

        {/* Tab 内容 */}
        <div className="px-6 py-4">
          {tab === 'geo' ? (
            <div className="space-y-4">
              {/* AI 原始值 */}
              <div className="text-xs text-text-subtle flex items-center gap-2">
                <span>AI 原始坐标：</span>
                <span className="font-mono">
                  {fmtCoord(originalLat)}, {fmtCoord(originalLng)}
                </span>
              </div>

              {/* lat */}
              <div>
                <label className="field-label">
                  纬度 <span className="text-text-subtle font-normal">（-90 ~ 90）</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="例如 30.746500"
                    className="field-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(lat) || 0;
                      setLat((cur - 0.0001).toFixed(6));
                    }}
                    className="w-8 h-8 rounded border border-border text-text-muted hover:bg-surface-alt text-xs shrink-0"
                    aria-label="纬度 -0.0001"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(lat) || 0;
                      setLat((cur + 0.0001).toFixed(6));
                    }}
                    className="w-8 h-8 rounded border border-border text-text-muted hover:bg-surface-alt text-xs shrink-0"
                    aria-label="纬度 +0.0001"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* lng */}
              <div>
                <label className="field-label">
                  经度 <span className="text-text-subtle font-normal">（-180 ~ 180）</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="例如 120.755800"
                    className="field-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(lng) || 0;
                      setLng((cur - 0.0001).toFixed(6));
                    }}
                    className="w-8 h-8 rounded border border-border text-text-muted hover:bg-surface-alt text-xs shrink-0"
                    aria-label="经度 -0.0001"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(lng) || 0;
                      setLng((cur + 0.0001).toFixed(6));
                    }}
                    className="w-8 h-8 rounded border border-border text-text-muted hover:bg-surface-alt text-xs shrink-0"
                    aria-label="经度 +0.0001"
                  >
                    +
                  </button>
                </div>
              </div>

              {geoPairError && (
                <p className="text-xs text-danger">{geoPairError}</p>
              )}

              {/* 地图选点 + 当前坐标回显 */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition-all"
                >
                  📍 {lat.trim() && lng.trim() ? '重新选点' : '地图选点'}
                </button>
                {lat.trim() && lng.trim() && (
                  <span className="text-xs text-text-subtle font-mono">
                    {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
                  </span>
                )}
              </div>

              {/* 地址（逆地理编码自动回填） */}
              {address && (
                <div className="rounded-lg bg-jade-soft border border-jade/20 px-3 py-2 text-xs text-jade-deep">
                  📍 {address}
                </div>
              )}

              {/* 当前值回显 */}
              {lat && lng && !geoPairError && (
                <div className="rounded-lg bg-jade-soft border border-jade/20 px-3 py-2 text-xs text-jade-deep font-mono">
                  修正后：{Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
                </div>
              )}

              <LocationPickerDialog
                open={pickerOpen}
                initialLat={lat.trim() ? Number(lat) : null}
                initialLng={lng.trim() ? Number(lng) : null}
                onConfirm={handlePickConfirm}
                onCancel={() => setPickerOpen(false)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* AI 原始交通 */}
              <div className="text-xs text-text-subtle flex items-center gap-2">
                <span>AI 原始交通：</span>
                {originalTransport ? (
                  <span>
                    {TRANSPORT_EMOJI[originalTransport.mode as TransportMode] ?? '🚗'}{' '}
                    {TRANSPORT_LABEL[originalTransport.mode as TransportMode] ?? originalTransport.mode}
                    {originalTransport.durationMin > 0 && ` · ${originalTransport.durationMin} 分钟`}
                    {originalTransport.description && ` · ${originalTransport.description}`}
                  </span>
                ) : (
                  <span>未提供</span>
                )}
              </div>

              {/* 交通方式 */}
              <div>
                <label className="field-label">交通方式</label>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`px-2 py-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        mode === m
                          ? 'border-jade bg-jade-soft text-jade-deep'
                          : 'border-border bg-surface text-text-muted hover:border-border-strong'
                      }`}
                    >
                      <span>{TRANSPORT_EMOJI[m]}</span>
                      <span>{TRANSPORT_LABEL[m]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 耗时 */}
              <div>
                <label className="field-label">
                  预计耗时 <span className="text-text-subtle font-normal">（分钟）</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="例如 10"
                  className="field-input"
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="field-label">
                  补充说明 <span className="text-text-subtle font-normal">（选填）</span>
                </label>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="例如：经复兴大桥"
                  className="field-input"
                />
              </div>

              {/* 预览 */}
              {(mode || duration || desc) && (
                <div className="rounded-lg bg-jade-soft border border-jade/20 px-3 py-2 text-xs text-jade-deep">
                  修正后：{TRANSPORT_EMOJI[mode]} {TRANSPORT_LABEL[mode]}
                  {duration && ` · ${duration} 分钟`}
                  {desc && ` · ${desc}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          {/* 删除（仅当已持久化时显示） */}
          <div>
            {initial && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="text-xs text-danger hover:text-danger disabled:opacity-50 transition-colors"
              >
                删除修正
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-ghost"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isPristine || geoPairError != null}
              className="btn btn-primary"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
