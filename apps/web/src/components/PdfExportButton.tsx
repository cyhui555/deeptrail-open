'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { FileDown, LoaderCircle } from 'lucide-react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { backfillCoordinates, getCheckinTasks } from '@/lib/api';
import { getValidItemCoordinate } from '@/lib/coordinates';
import type { CheckinTask, TripPlanDetail } from '@/types';

interface PdfExportButtonProps {
  /** 当前行程 ID；导出前用于等待坐标回填并重新读取最新任务。 */
  planId: string;
  /** 按天的打卡任务列表。 */
  tasks: CheckinTask[];
  /** 行程清单详情（标题、目的地、日期）。 */
  detail: TripPlanDetail | null;
}

/** 导出阶段。 */
type Phase = 'idle' | 'generating' | 'error';

/**
 * PDF 导出按钮。
 *
 * <p>在全部行程概览页顶栏展示，点击后获取高德静态地图图片 + 构造 PDF 触发下载。
 * 地图快照通过高德静态地图 REST API 生成（不受跨域瓦片污染影响）；
 * 导出中禁用重复点击并显示 loading 状态；失败时降级为 ErrorAlert + 可重试。
 */
export function PdfExportButton({ planId, tasks, detail }: PdfExportButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const exportingRef = useRef(false);

  /** 所有打卡项的扁平列表（用于静态地图 POI 标注）。 */
  const allItems = useMemo(() => tasks.flatMap((t) => t.items), [tasks]);

  const handleExport = useCallback(async () => {
    // 防重复点击（同步锁 + 状态双重保护）
    if (exportingRef.current) return;
    exportingRef.current = true;
    setPhase('generating');
    setError(null);
    setWarning(null);

    try {
      // PDF 依赖体积较大，只在用户明确导出时并行加载，避免占用概览页首屏下载与解析预算。
      const [pdfModule, staticMapModule] = await Promise.all([
        import('@/lib/generatePdf'),
        import('@/lib/staticMap'),
      ]);
      const { generateAndDownloadPdf, mergeMapAndOverlay } = pdfModule;
      const { fetchMapCoverData } = staticMapModule;

      // 1. 导出动作恢复“等待坐标准备完成”语义；首屏仍保持异步，避免拖慢页面。
      let exportTasks = tasks;
      let exportItems = allItems;
      const initiallyMissing = exportItems.some(
        (item) => item.status !== 'ABANDONED' && !getValidItemCoordinate(item),
      );
      if (initiallyMissing) {
        await backfillCoordinates(planId);
        exportTasks = await getCheckinTasks(planId);
        exportItems = exportTasks.flatMap((task) => task.items);
      }

      const expectedCoordinateCount = exportItems.filter((item) => item.status !== 'ABANDONED').length;
      const validCoordinateCount = exportItems.filter(
        (item) => item.status !== 'ABANDONED' && getValidItemCoordinate(item),
      ).length;
      if (validCoordinateCount === 0) {
        throw new Error('路线地图坐标仍未准备好，请先在完整路线页重试补全坐标。');
      }
      if (validCoordinateCount < expectedCoordinateCount) {
        setWarning(`本次地图包含 ${validCoordinateCount}/${expectedCoordinateCount} 个有效地点，其余地点仍保留在每日文字行程中。`);
      }

      // 2. 地图生成失败时阻止下载缺图 PDF，避免把静默降级误当成成功。
      const coverData = await fetchMapCoverData(exportItems);
      if (!coverData.dataUrl) {
        throw new Error('路线底图生成失败，请检查地图服务后重试。');
      }
      const mapSnapshot = coverData.positions.length > 0
        ? await mergeMapAndOverlay(coverData.dataUrl, coverData.positions)
        : coverData.dataUrl;
      const mapMarkerPositions = coverData.positions;
      const mapLegend = coverData.legend;

      // 3. 构造并下载 PDF（mapSnapshot 已预合成标注，无需 DOM 层叠）
      await generateAndDownloadPdf({
        title: detail?.title ?? '我的旅行手册',
        destination: detail?.destination ?? undefined,
        dateRange: detail?.plannedDate ?? undefined,
        mapSnapshot,
        tasks: exportTasks,
        mapLegend,
        mapMarkerPositions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 导出失败，请稍后重试');
      setPhase('error');
      exportingRef.current = false;
      return;
    }

    exportingRef.current = false;
    setPhase('idle');
  }, [planId, tasks, detail, allItems]);

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <div className="w-full max-w-xs">
          <ErrorAlert message={error} />
        </div>
      )}
      {warning && !error && (
        <p role="status" className="max-w-xs text-right text-xs leading-5 text-amber-700">{warning}</p>
      )}
      <button
        type="button"
        onClick={handleExport}
        disabled={phase === 'generating'}
        className={`inline-flex min-w-[132px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
          phase === 'generating'
            ? 'cursor-wait border border-primary-200 bg-primary-100 text-primary-700'
            : 'button-primary hover:bg-primary-700'
        }`}
        title="将路线地图 + 每日行程导出为 PDF 旅行手册"
      >
        {phase === 'generating' ? (
          <>
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" strokeWidth={1.8} />
            生成中…
          </>
        ) : (
          <>
            <FileDown aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            导出 PDF
          </>
        )}
      </button>
    </div>
  );
}
