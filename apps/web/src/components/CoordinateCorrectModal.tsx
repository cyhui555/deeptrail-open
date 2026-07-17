'use client';

import { ModalDialog } from '@/components/ModalDialog';

interface CoordinateCorrectModalProps {
  open: boolean;
  lat: number;
  lng: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 坐标修正确认弹窗。
 *
 * <p>用户拖动地图标记点后弹出，显示新坐标并让用户确认是否持久化。
 */
export function CoordinateCorrectModal({ open, lat, lng, onConfirm, onCancel }: CoordinateCorrectModalProps) {
  if (!open) return null;

  return (
    <ModalDialog
      open={open}
      onClose={onCancel}
      labelledBy="coordinate-correct-title"
      describedBy="coordinate-correct-description"
      panelClassName="max-w-sm p-6"
    >
      <div className="space-y-4">
        <h3 id="coordinate-correct-title" className="text-lg font-semibold text-gray-800">修正打卡点坐标</h3>
        <p id="coordinate-correct-description" className="text-sm text-gray-600">确认将此打卡点移动到以下新位置？</p>
        <dl className="space-y-1 rounded-xl bg-gray-50 p-3 text-sm font-mono text-gray-700">
          <div className="flex justify-between gap-3"><dt>纬度</dt><dd>{lat.toFixed(6)}</dd></div>
          <div className="flex justify-between gap-3"><dt>经度</dt><dd>{lng.toFixed(6)}</dd></div>
        </dl>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            data-autofocus
            onClick={onCancel}
            className="button-secondary px-4"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="button-primary px-4"
          >
            确认修改
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
