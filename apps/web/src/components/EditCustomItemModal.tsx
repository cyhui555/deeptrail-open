'use client';

import { useState } from 'react';
import { MapPinned, X } from 'lucide-react';
import { editCustomItem } from '@/lib/api';
import type { CheckinItem } from '@/types';
import { LocationPickerDialog } from '@/components/LocationPickerDialog';
import { ModalDialog } from '@/components/ModalDialog';
import type { PickedLocation } from '@/components/LocationPickerDialog';

interface EditCustomItemModalProps {
  /** 被编辑的打卡项（isCustom=true + PENDING）。 */
  item: CheckinItem;
  /** 是否显示弹窗。 */
  open: boolean;
  /** 关闭弹窗回调。 */
  onClose: () => void;
  /** 保存成功后回调（用于刷新列表）。 */
  onSaved: () => void;
}

/** 编辑自定义行程点的表单弹窗，供清单详情页 / 每日打卡页复用。 */
export function EditCustomItemModal({ item, open, onClose, onSaved }: EditCustomItemModalProps) {
  const [name, setName] = useState(item.poiName);
  const [period, setPeriod] = useState(item.period ?? '下午');
  const [description, setDescription] = useState(item.description ?? '');
  const [estimatedCost, setEstimatedCost] = useState(item.estimatedCost ?? '');
  const [address, setAddress] = useState(item.poiAddress ?? '');
  const [lat, setLat] = useState(item.poiLat != null ? String(item.poiLat) : '');
  const [lng, setLng] = useState(item.poiLng != null ? String(item.poiLng) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!open) return null;

  /** 地图选点确认：回填经纬度和地址（对话框内部已完成逆地理编码） */
  const handlePickConfirm = (loc: PickedLocation) => {
    setLat(String(loc.lat));
    setLng(String(loc.lng));
    if (loc.address) setAddress(loc.address);
    setPickerOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('请输入地名 / 名称');
      return;
    }

    // 经纬度校验：必须同时填或同时留空
    const latStr = lat.trim();
    const lngStr = lng.trim();
    let latNum: number | null = null;
    let lngNum: number | null = null;
    if (latStr !== '' || lngStr !== '') {
      if (latStr === '' || lngStr === '') {
        setError('经纬度需同时填写或同时留空');
        return;
      }
      latNum = Number(latStr);
      lngNum = Number(lngStr);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        setError('经纬度需为有效数字');
        return;
      }
      if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        setError('经纬度超出有效范围（纬度 -90~90，经度 -180~180）');
        return;
      }
      if (latNum === 0 && lngNum === 0) {
        setError('坐标 (0, 0) 无效，请输入真实经纬度');
        return;
      }
    }

    setSaving(true);
    try {
      await editCustomItem(item.id, {
        name: name.trim(),
        period: period || null,
        description: description.trim() || null,
        estimatedCost: estimatedCost.trim() || null,
        address: address.trim() || null,
        lat: latNum,
        lng: lngNum,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      labelledBy="edit-item-title"
      dismissDisabled={pickerOpen}
      panelClassName="max-h-[90dvh] max-w-md overflow-y-auto"
    >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 id="edit-item-title" className="text-base font-semibold text-gray-900">编辑自定义行程点</h3>
          <button type="button" onClick={onClose} className="grid min-h-10 min-w-10 place-items-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="关闭编辑行程点弹窗">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label htmlFor="edit-item-name" className="block text-sm font-medium text-gray-700 mb-1">
              地名 / 名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-item-name"
              data-autofocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="自定义点名称"
              required
            />
          </div>
          <div>
            <label htmlFor="edit-item-period" className="block text-sm font-medium text-gray-700 mb-1">时段</label>
            <select
              id="edit-item-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="早上">早上</option>
              <option value="上午">上午</option>
              <option value="中午">中午</option>
              <option value="下午">下午</option>
              <option value="晚上">晚上</option>
              <option value="深夜">深夜</option>
            </select>
          </div>
          <div>
            <label htmlFor="edit-item-address" className="block text-sm font-medium text-gray-700 mb-1">
              地址 <span className="text-gray-400 font-normal">（选填）</span>
            </label>
            <input
              id="edit-item-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="可选"
            />
          </div>
          <div>
            <label htmlFor="edit-item-description" className="block text-sm font-medium text-gray-700 mb-1">
              描述 <span className="text-gray-400 font-normal">（选填）</span>
            </label>
            <textarea
              id="edit-item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="简单描述这个景点的亮点"
            />
          </div>
          <div>
            <label htmlFor="edit-item-cost" className="block text-sm font-medium text-gray-700 mb-1">
              预计花费 <span className="text-gray-400 font-normal">（选填）</span>
            </label>
            <input
              id="edit-item-cost"
              type="text"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如：50元/人"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="edit-item-lat" className="block text-sm font-medium text-gray-700 mb-1">
                纬度 lat <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                id="edit-item-lat"
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如：30.67"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="edit-item-lng" className="block text-sm font-medium text-gray-700 mb-1">
                经度 lng <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                id="edit-item-lng"
                type="text"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如：104.06"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-800 transition hover:bg-primary-100 active:scale-[0.98]"
            >
              <MapPinned aria-hidden="true" className="h-4 w-4" />
              {lat.trim() && lng.trim() ? '重新选点' : '地图选点'}
            </button>
            {lat.trim() && lng.trim() && (
              <span className="text-xs text-gray-400 font-mono">
                {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
              </span>
            )}
          </div>
          <LocationPickerDialog
            open={pickerOpen}
            initialLat={lat.trim() ? Number(lat) : null}
            initialLng={lng.trim() ? Number(lng) : null}
            onConfirm={handlePickConfirm}
            onCancel={() => setPickerOpen(false)}
          />
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="button-secondary flex-1 px-3"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="button-primary flex-1 px-3"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
    </ModalDialog>
  );
}
