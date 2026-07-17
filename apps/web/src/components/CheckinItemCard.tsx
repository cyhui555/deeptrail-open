'use client';

import { PoiInfoCard } from '@/components/PoiInfoCard';
import { CircleSlash2, ImagePlus, Info, MapPinCheck, Pencil, Undo2 } from 'lucide-react';
import type { CheckinItem } from '@/types';

interface CheckinItemCardProps {
  item: CheckinItem;
  onCheckin?: () => void;
  onUndo?: () => void;
  onAbandon?: () => void;
  onViewDetail?: () => void;
  onAddMedia?: () => void;
  /** 编辑自定义行程点（仅 isCustom=true 且 PENDING 状态显示）。 */
  onEdit?: () => void;
}

/**
 * 打卡项卡片组件（丰富版）。
 *
 * <p>组合层：PoiInfoCard（只读信息）+ 一组操作按钮（打卡/废弃/删除/媒体）。
 * 对外接口与原版保持一致，避免下游 trips 与 checkin 页面的大量改动。
 */
export function CheckinItemCard({
  item,
  onCheckin,
  onUndo,
  onAbandon,
  onViewDetail,
  onAddMedia,
  onEdit,
}: CheckinItemCardProps) {
  const isCheckedIn = item.status === 'CHECKED_IN';
  const isPending = item.status === 'PENDING';
  const isCustom = !!item.isCustom;
  const mediaCount = item.media?.length ?? 0;
  const canAddMedia = isCheckedIn && mediaCount < 10;

  return (
    <div>
      {/* 结构化 POI 信息 */}
      <PoiInfoCard item={item} />

      {/* 操作按钮（独立一行） */}
      <div className="mt-2 flex gap-2 flex-wrap">
        {isPending && onCheckin && (
          <button
            type="button"
            onClick={onCheckin}
            className="button-primary min-h-10 gap-1.5 px-3"
          >
            <MapPinCheck aria-hidden="true" className="h-4 w-4" />
            打卡
          </button>
        )}
        {isPending && onAbandon && (
          <button
            type="button"
            onClick={onAbandon}
            className="button-danger min-h-10 px-3"
          >
            <CircleSlash2 aria-hidden="true" className="h-4 w-4" />
            放弃
          </button>
        )}
        {isCustom && isPending && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="button-secondary min-h-10 gap-1.5 px-3"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            编辑
          </button>
        )}
        {isCheckedIn && onUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="button-danger min-h-10 px-3"
          >
            <Undo2 aria-hidden="true" className="h-4 w-4" />
            撤销打卡
          </button>
        )}
        {isCheckedIn && canAddMedia && onAddMedia && (
          <button
            type="button"
            onClick={onAddMedia}
            className="button-secondary min-h-10 gap-1.5 px-3"
          >
            <ImagePlus aria-hidden="true" className="h-4 w-4" />
            添加媒体
          </button>
        )}
        {onViewDetail && (
          <button
            type="button"
            onClick={onViewDetail}
            className="button-secondary min-h-10 gap-1.5 px-3"
          >
            <Info aria-hidden="true" className="h-4 w-4" />
            详情
          </button>
        )}
      </div>
    </div>
  );
}
