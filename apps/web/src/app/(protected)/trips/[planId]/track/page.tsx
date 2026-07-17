'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  LoaderCircle,
  Radio,
  RotateCw,
  Route,
  Square,
  Trash2,
} from 'lucide-react';
import { TripsSubNav } from '@/components/TripsSubNav';
import { useAppFeedback } from '@/components/FeedbackProvider';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useTrackRecorder } from '@/hooks/useTrackRecorder';
import { getTrackPoints, uploadTrackPoints } from '@/lib/api';
import { createIdempotencyKey, saveOfflineTrackPoints } from '@/lib/offlineSync';
import type { TrackPoint } from '@/types';

/** 旅行现场的轨迹录制页：支持自适应采样、批量上传与断网暂存。 */
export default function TrackPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [uploading, setUploading] = useState(false);
  const { notify, confirmAction } = useAppFeedback();
  const { recording, pointCount, start, stop, clear } = useTrackRecorder();
  const { isOnline, syncing, lastSyncResult, manualSync } = useOfflineSync();

  const loadPoints = useCallback(async () => {
    try {
      setPoints(await getTrackPoints(planId));
    } catch {
      notify('历史轨迹加载失败，请稍后重试', 'error');
    }
  }, [notify, planId]);

  useEffect(() => {
    if (planId) void loadPoints();
  }, [loadPoints, planId]);

  const handleClear = async () => {
    if (pointCount === 0) return;
    const accepted = await confirmAction({
      title: '清除本次轨迹？',
      description: `当前 ${pointCount} 个尚未上传的轨迹点会被移除。`,
      confirmLabel: '清除',
      danger: true,
    });
    if (accepted) clear();
  };

  const handleStopAndUpload = async () => {
    const recordedPoints = stop();
    if (recordedPoints.length === 0) {
      notify('没有可上传的有效轨迹点', 'info');
      return;
    }

    setUploading(true);
    const payload = recordedPoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy ?? undefined,
      altitude: point.altitude ?? undefined,
      speed: point.speed ?? undefined,
      recordedAt: point.recordedAt,
      // 每个采样点独立去重；批次切分或响应丢失后仍复用这个标识。
      clientPointId: createIdempotencyKey(),
    }));
    try {
      const saved = await uploadTrackPoints(planId, payload);
      clear();
      notify(`已保存 ${saved} 个轨迹点`, 'success');
      await loadPoints();
    } catch (error) {
      const networkFailure = !navigator.onLine
        || (error instanceof TypeError && error.message.includes('fetch'));
      if (!networkFailure) {
        notify(error instanceof Error ? error.message : '轨迹上传失败', 'error');
        return;
      }

      try {
        await saveOfflineTrackPoints(payload.map((point) => ({
          planId,
          latitude: point.latitude,
          longitude: point.longitude,
          altitude: point.altitude,
          speed: point.speed,
          accuracy: point.accuracy,
          recordedAt: point.recordedAt,
          clientPointId: point.clientPointId,
        })));
        clear();
        notify(`已离线保存 ${recordedPoints.length} 个点，联网后自动同步`, 'success');
      } catch {
        notify('轨迹本地保存失败，请勿关闭页面并重试', 'error');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 pb-5">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        返回
      </button>

      <TripsSubNav planId={planId} active="track" />

      {!isOnline && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          当前离线。结束录制后轨迹会保存在本机，联网后自动同步。
        </div>
      )}
      {syncing && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900" role="status">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          正在同步离线数据…
        </div>
      )}
      {lastSyncResult && (lastSyncResult.checkins > 0 || lastSyncResult.tracks > 0) && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900" role="status">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          已同步 {lastSyncResult.checkins} 条打卡、{lastSyncResult.tracks} 个轨迹点
        </div>
      )}

      <section className="glass-strong overflow-hidden rounded-2xl shadow-card">
        <div className="border-b border-white/70 bg-gradient-to-br from-primary-50/80 to-transparent p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-700 text-white shadow-sm">
              <Route aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-950">记录旅行轨迹</h1>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                开启后会根据步行或乘车速度自适应采样；停止时一次上传，断网则安全暂存。
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {recording && (
            <div className="mb-5 flex items-center justify-between rounded-xl border border-red-100 bg-red-50/80 px-4 py-3" role="status">
              <span className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <Radio aria-hidden="true" className="h-4 w-4 animate-pulse" />
                正在记录
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-red-900">{pointCount} 个点</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 sm:flex">
            {!recording ? (
              <button type="button" onClick={start} className="button-primary gap-2 px-5">
                <Radio aria-hidden="true" className="h-4 w-4" />
                开始记录
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopAndUpload}
                disabled={uploading}
                className="button-primary gap-2 px-5"
              >
                {uploading
                  ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                  : <Square aria-hidden="true" className="h-4 w-4" />}
                {uploading ? '正在保存…' : '结束并保存'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={recording || pointCount === 0}
              className="button-secondary gap-2 px-5"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              清除本次
            </button>
            {isOnline && !syncing && (
              <button type="button" onClick={() => void manualSync()} className="button-secondary col-span-2 gap-2 px-5">
                <RotateCw aria-hidden="true" className="h-4 w-4" />
                同步离线记录
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-gray-950">历史轨迹</h2>
          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold tabular-nums text-primary-800">
            {points.length} 个点
          </span>
        </div>
        {points.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
            还没有轨迹记录。到达旅行现场后，从这里开始记录。
          </p>
        ) : (
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
            {points.slice(-30).reverse().map((point) => (
              <div key={point.id} className="flex justify-between gap-4 border-b border-gray-100 py-2 text-xs text-gray-600 last:border-0">
                <span className="font-mono tabular-nums">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</span>
                <time className="shrink-0 tabular-nums" dateTime={point.recordedAt}>
                  {new Date(point.recordedAt).toLocaleTimeString('zh-CN')}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
