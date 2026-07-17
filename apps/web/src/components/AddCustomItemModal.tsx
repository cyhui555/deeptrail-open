'use client';

import { useState } from 'react';
import { MapPinned, X } from 'lucide-react';
import { addCustomItem } from '@/lib/api';
import { LocationPickerDialog } from '@/components/LocationPickerDialog';
import { ModalDialog } from '@/components/ModalDialog';
import type { PickedLocation } from '@/components/LocationPickerDialog';

interface AddCustomItemModalProps {
  /** 行程清单 ID。 */
  planId: string;
  /** 目标打卡任务 ID（某天）。 */
  taskId: string;
  /** 是否显示弹窗。 */
  open: boolean;
  /** 关闭弹窗回调。 */
  onClose: () => void;
  /** 添加成功后回调（用于刷新列表）。 */
  onAdded: () => void;
}

/** 添加自定义行程点的表单弹窗，供清单详情页 / 每日打卡页复用。 */
export function AddCustomItemModal({ planId, taskId, open, onClose, onAdded }: AddCustomItemModalProps) {
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('下午');
  const [description, setDescription] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setName('');
    setPeriod('下午');
    setDescription('');
    setEstimatedCost('');
    setAddress('');
    setLat('');
    setLng('');
    setError(null);
    setPickerOpen(false);
  };

  /** 地图选点确认：回填经纬度和地址（对话框内部已完成逆地理编码） */
  const handlePickConfirm = (loc: PickedLocation) => {
    setLat(String(loc.lat));
    setLng(String(loc.lng));
    if (loc.address) setAddress(loc.address);
    setPickerOpen(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
    let latNum: number | undefined;
    let lngNum: number | undefined;
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

    setAdding(true);
    try {
      await addCustomItem(planId, taskId, {
        name: name.trim(),
        period: period || undefined,
        description: description.trim() || undefined,
        estimatedCost: estimatedCost.trim() || undefined,
        address: address.trim() || undefined,
        lat: latNum,
        lng: lngNum,
      });
      resetForm();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setAdding(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={handleClose}
      labelledBy="add-item-title"
      describedBy="add-item-help"
      dismissDisabled={pickerOpen}
      panelClassName="max-h-[90dvh] max-w-md overflow-y-auto"
    >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 id="add-item-title" className="text-base font-semibold text-gray-900">添加行程点</h2>
          <button type="button" onClick={handleClose} className="grid min-h-10 min-w-10 place-items-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="关闭添加行程点弹窗">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && (
            <div id="add-item-error" role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="add-item-name" className="block text-sm font-medium text-gray-700 mb-1">
              地名 / 名称 <span className="text-red-400">*</span>
            </label>
            <input
              id="add-item-name"
              data-autofocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如：宽窄巷子 / 朋友推荐的小店"
              required
            />
          </div>
          <div>
            <label htmlFor="add-item-period" className="block text-sm font-medium text-gray-700 mb-1">时段</label>
            <select
              id="add-item-period"
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
            <label htmlFor="add-item-address" className="block text-sm font-medium text-gray-700 mb-1">
              地址 <span className="text-gray-400 font-normal">（选填）</span>
            </label>
            <input
              id="add-item-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如：人民南路二段"
            />
          </div>
          <div>
            <label htmlFor="add-item-description" className="block text-sm font-medium text-gray-700 mb-1">
              描述 <span className="text-gray-400 font-normal">（选填）</span>
            </label>
            <textarea
              id="add-item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="简单描述这个景点的亮点"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="add-item-cost" className="block text-sm font-medium text-gray-700 mb-1">
                预计花费 <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                id="add-item-cost"
                type="text"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如：50元/人"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="add-item-lat" className="block text-sm font-medium text-gray-700 mb-1">
                纬度 lat <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                id="add-item-lat"
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如：30.67"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="add-item-lng" className="block text-sm font-medium text-gray-700 mb-1">
                经度 lng <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                id="add-item-lng"
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
          <p id="add-item-help" className="text-xs leading-5 text-gray-500">
            提示：地名必填；点击「地图选点」可在地图上点选位置，自动填充经纬度和地址。
          </p>
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
              onClick={handleClose}
              className="button-secondary flex-1 px-3"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={adding}
              className="button-primary flex-1 px-3"
            >
              {adding ? '添加中...' : '确认添加'}
            </button>
          </div>
        </form>
    </ModalDialog>
  );
}
