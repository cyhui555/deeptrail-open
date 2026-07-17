'use client';

import { getPeriodStyle } from '@/components/ItineraryTimeline';
import {
  Banknote,
  CheckCircle2,
  Circle,
  Clock3,
  LocateFixed,
  MapPin,
  NotebookPen,
  Phone,
  Play,
  Sparkles,
  Star,
  Ticket,
  Timer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getPoiDisplayFields } from '@/lib/poiDisplay';
import type { CheckinItem } from '@/types';

interface PoiInfoCardProps {
  item: CheckinItem;
}

function MetaItem({ icon: Icon, children, className = '' }: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
      <span>{children}</span>
    </span>
  );
}

/**
 * 结构化 POI 信息卡片（无操作按钮）。
 *
 * <p>可视化层封装：时段色块 + POI 名称状态行 + 打卡时间坐标行 + 媒体缩略图。
 * 操作按钮（打卡/废弃/删除/媒体）由父组件决定是否注入，本组件仅做只读展示。
 *
 * <p>被 CheckinItemCard 和 overview 页面复用，避免两套样式漂移。
 */
export function PoiInfoCard({ item }: PoiInfoCardProps) {
  const isCheckedIn = item.status === 'CHECKED_IN';
  const isAbandoned = item.status === 'ABANDONED';
  const isPending = item.status === 'PENDING';
  const periodStyle = item.period ? getPeriodStyle(item.period) : null;
  const mediaCount = item.media?.length ?? 0;
  const displayFields = getPoiDisplayFields(item);
  const hasInfo =
    item.openingHours ||
    item.admissionFee ||
    item.estimatedCost ||
    item.rating ||
    item.estimatedVisitTime ||
    item.category ||
    item.phone ||
    displayFields.addressMeta;

  return (
    <div
      data-testid="poi-info-card"
      className={`rounded-xl border shadow-sm overflow-hidden ${
        isAbandoned
          ? 'bg-gray-50 border-gray-200 opacity-60'
          : 'bg-white border-gray-100'
      }`}
    >
      {/* 时段色卡顶部条 */}
      {periodStyle && !isAbandoned && <div className={`h-1 ${periodStyle.bgColor}`} />}

      <div className="p-4 space-y-2">
        {/* 时段卡片：色块背景 + 图标 + 描述 + POI 信息标签 */}
        {periodStyle && !isAbandoned && (
          <div className={`flex gap-2 sm:gap-3 p-3 rounded-xl ${periodStyle.bgColor} border ${periodStyle.borderColor}`}>
            {/* 时段图标 */}
            <div className="shrink-0 w-14 sm:w-16 flex flex-col items-center justify-center">
              <Clock3 aria-hidden="true" className={`h-5 w-5 ${periodStyle.color}`} strokeWidth={1.8} />
              <span className={`text-xs font-medium ${periodStyle.color} mt-0.5`}>{item.period}</span>
            </div>

            {/* 内容：描述 + POI 信息标签 */}
            <div className="flex-1 min-w-0">
              {displayFields.primaryContent && (
                <p data-testid="poi-primary-content" className="text-sm text-gray-800 leading-relaxed">
                  {displayFields.primaryContent}
                </p>
              )}
              {hasInfo && (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-gray-500">
                  {displayFields.addressMeta && <MetaItem icon={MapPin}>{displayFields.addressMeta}</MetaItem>}
                  {item.category && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.category}</span>}
                  {item.rating && <MetaItem icon={Star} className="text-amber-700">{item.rating}</MetaItem>}
                  {item.admissionFee && <MetaItem icon={Ticket}>{item.admissionFee}</MetaItem>}
                  {item.openingHours && <MetaItem icon={Clock3}>{item.openingHours}</MetaItem>}
                  {item.estimatedVisitTime && <MetaItem icon={Timer} className="text-gray-500">{item.estimatedVisitTime}</MetaItem>}
                  {item.estimatedCost && <MetaItem icon={Banknote} className="text-gray-500">{item.estimatedCost}</MetaItem>}
                  {item.phone && <MetaItem icon={Phone} className="text-gray-500">{item.phone}</MetaItem>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 无时段时的 fallback：显示描述和信息 */}
        {!periodStyle && !isAbandoned && (displayFields.primaryContent || hasInfo) && (
          <div className="space-y-1">
            {displayFields.primaryContent && (
              <p data-testid="poi-primary-content" className="text-sm text-gray-800 leading-relaxed">
                {displayFields.primaryContent}
              </p>
            )}
            {hasInfo && (
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                {displayFields.addressMeta && <MetaItem icon={MapPin}>{displayFields.addressMeta}</MetaItem>}
                {item.category && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.category}</span>}
                {item.rating && <MetaItem icon={Star} className="text-amber-700">{item.rating}</MetaItem>}
                {item.admissionFee && <MetaItem icon={Ticket}>{item.admissionFee}</MetaItem>}
                {item.openingHours && <MetaItem icon={Clock3}>{item.openingHours}</MetaItem>}
                {item.estimatedVisitTime && <MetaItem icon={Timer} className="text-gray-500">{item.estimatedVisitTime}</MetaItem>}
                {item.estimatedCost && <MetaItem icon={Banknote} className="text-gray-500">{item.estimatedCost}</MetaItem>}
                {item.phone && <MetaItem icon={Phone} className="text-gray-500">{item.phone}</MetaItem>}
              </div>
            )}
          </div>
        )}

        {/* 独立 POI 信息卡片（名称 + 状态角标） */}
        {displayFields.showLocationCard && (
          <div className="ml-0 sm:ml-16 rounded-lg px-3 py-2 text-xs border bg-white border-gray-100 flex items-center gap-1.5 flex-wrap">
            <span
              data-testid="poi-location-label"
              className={`font-medium ${isAbandoned ? 'text-gray-500 line-through' : 'text-gray-700'}`}
            >
              {displayFields.locationLabel}
            </span>
            {item.isCustom && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                <Sparkles aria-hidden="true" className="h-3 w-3" /> 自定义
              </span>
            )}
            {item.isCoordinateCorrected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-1.5 py-0.5 text-xs font-medium text-primary-800">
                <LocateFixed aria-hidden="true" className="h-3 w-3" /> 已修正
              </span>
            )}
            {isCheckedIn && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> 已打卡
              </span>
            )}
            {isPending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                <Circle aria-hidden="true" className="h-3 w-3" /> 未打卡
              </span>
            )}
            {isAbandoned && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-500">已放弃</span>
            )}
          </div>
        )}

        {/* 打卡成功后展示：时间、坐标、距离、笔记 */}
        {isCheckedIn && item.checkedInAt && (
          <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
            <MetaItem icon={Clock3} className="text-green-700 font-medium">
              {new Date(item.checkedInAt).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </MetaItem>
            {item.checkinLat != null && item.checkinLng != null && (
              <MetaItem icon={MapPin}>{item.checkinLat.toFixed(4)}, {item.checkinLng.toFixed(4)}</MetaItem>
            )}
            {item.distanceMeters != null && item.distanceMeters > 0 && (
              <span className="text-blue-600">（距 POI {item.distanceMeters.toFixed(0)} 米）</span>
            )}
            {item.source === 'MANUAL' && <span className="text-gray-400">手动打卡</span>}
            {item.note && <MetaItem icon={NotebookPen} className="border-l border-gray-300 pl-1.5 text-gray-600">{item.note}</MetaItem>}
          </div>
        )}

        {/* 媒体缩略图 */}
        {isCheckedIn && mediaCount > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pt-1">
            {item.media.slice(0, 4).map((m, index) => (
              <a
                key={m.id}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${item.poiName}的第 ${index + 1} 个${m.mediaType === 'IMAGE' ? '照片' : '视频'}，在新窗口打开`}
                className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {m.mediaType === 'IMAGE' ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated media URL must be fetched by the browser */}
                    <img src={m.url} alt={`${item.poiName}旅行照片 ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </>
                ) : (
                  <div className="relative w-full h-full bg-gray-100">
                    {m.thumbnailUrl && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic video thumbnail uses the authenticated media endpoint */}
                        <img src={m.thumbnailUrl} alt={`${item.poiName}视频封面 ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play aria-hidden="true" className="h-5 w-5 fill-white text-white" />
                    </div>
                  </div>
                )}
              </a>
            ))}
            {mediaCount > 4 && (
              <div aria-label={`另有 ${mediaCount - 4} 个媒体`} className="shrink-0 w-16 h-16 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center text-xs font-medium text-gray-600">
                +{mediaCount - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
