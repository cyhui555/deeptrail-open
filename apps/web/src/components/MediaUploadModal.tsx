'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { uploadMedia } from '@/lib/api';
import type { CheckinMedia } from '@/types';

interface MediaUploadModalProps {
  itemId: number;
  existingMedia: CheckinMedia[];
  onClose: () => void;
  /** 媒体上传成功后通知父组件刷新打卡详情。 */
  onUploaded?: () => void;
}

interface UploadingItem {
  id: string;
  file: File;
  preview: string;
  progress: number;
  error?: string;
  result?: CheckinMedia;
}

const MAX_IMAGES = 9;
const MAX_VIDEOS = 1;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 2;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

/** 打卡媒体上传弹窗：限制并发上传并及时回收 Blob 预览，避免移动端内存峰值。 */
export function MediaUploadModal({ itemId, existingMedia, onClose, onUploaded }: MediaUploadModalProps) {
  const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef(new Set<string>());

  const releasePreview = useCallback((url: string) => {
    if (!previewUrlsRef.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }, []);

  const imageCount = useMemo(() => (
    existingMedia.filter((media) => media.mediaType === 'IMAGE').length
      + uploadingItems.filter((item) => item.file.type.startsWith('image/')).length
  ), [existingMedia, uploadingItems]);
  const videoCount = useMemo(() => (
    existingMedia.filter((media) => media.mediaType === 'VIDEO').length
      + uploadingItems.filter((item) => item.file.type.startsWith('video/')).length
  ), [existingMedia, uploadingItems]);
  const canAdd = imageCount < MAX_IMAGES || videoCount < MAX_VIDEOS;
  const hasActiveUploads = uploadingItems.some((item) => !item.result && !item.error && item.progress > 0);

  const startUpload = useCallback(async (item: UploadingItem): Promise<boolean> => {
    setUploadingItems((current) => current.map((candidate) => (
      candidate.id === item.id
        ? { ...candidate, progress: 8, error: undefined }
        : candidate
    )));
    try {
      const result = await uploadMedia(itemId, item.file);
      setUploadingItems((current) => current.map((candidate) => (
        candidate.id === item.id ? { ...candidate, progress: 100, result } : candidate
      )));
      window.setTimeout(() => {
        releasePreview(item.preview);
        setUploadingItems((current) => current.filter((candidate) => candidate.id !== item.id));
      }, 700);
      return true;
    } catch (uploadError) {
      setUploadingItems((current) => current.map((candidate) => (
        candidate.id === item.id
          ? {
              ...candidate,
              progress: 0,
              error: uploadError instanceof Error ? uploadError.message : '上传失败',
            }
          : candidate
      )));
      return false;
    }
  }, [itemId, releasePreview]);

  const uploadQueue = useCallback(async (items: UploadingItem[]) => {
    let successCount = 0;
    for (let index = 0; index < items.length; index += UPLOAD_CONCURRENCY) {
      const results = await Promise.all(
        items.slice(index, index + UPLOAD_CONCURRENCY).map(startUpload),
      );
      successCount += results.filter(Boolean).length;
    }
    if (successCount > 0) onUploaded?.();
  }, [onUploaded, startUpload]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setError(null);
    const newItems: UploadingItem[] = [];
    let nextImageCount = imageCount;
    let nextVideoCount = videoCount;

    for (const file of files) {
      const isImage = IMAGE_TYPES.includes(file.type);
      const isVideo = VIDEO_TYPES.includes(file.type);
      if (!isImage && !isVideo) {
        setError(`不支持“${file.name}”的文件类型`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`“${file.name}”超过 50 MB，请压缩后重试`);
        continue;
      }
      if (isImage && nextImageCount >= MAX_IMAGES) {
        setError(`每个地点最多上传 ${MAX_IMAGES} 张照片`);
        continue;
      }
      if (isVideo && nextVideoCount >= MAX_VIDEOS) {
        setError(`每个地点最多上传 ${MAX_VIDEOS} 个视频`);
        continue;
      }

      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.add(preview);
      newItems.push({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        file,
        preview,
        progress: 0,
      });
      if (isImage) nextImageCount += 1;
      if (isVideo) nextVideoCount += 1;
    }

    if (newItems.length === 0) return;
    setUploadingItems((current) => [...current, ...newItems]);
    void uploadQueue(newItems);
  }, [imageCount, uploadQueue, videoCount]);

  const handleRetry = useCallback(async (item: UploadingItem) => {
    if (await startUpload(item)) onUploaded?.();
  }, [onUploaded, startUpload]);

  const handleRemove = useCallback((item: UploadingItem) => {
    if (!item.error && !item.result) return;
    releasePreview(item.preview);
    setUploadingItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }, [releasePreview]);

  const requestClose = useCallback(() => {
    if (!hasActiveUploads) onClose();
  }, [hasActiveUploads, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [requestClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-gray-950/35 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-upload-title"
        className="glass-strong flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/70 px-5 py-4">
          <div>
            <h2 id="media-upload-title" className="font-bold text-gray-950">记录现场</h2>
            <p className="mt-0.5 text-xs text-gray-500">照片 {imageCount}/{MAX_IMAGES} · 视频 {videoCount}/{MAX_VIDEOS}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={hasActiveUploads}
            className="grid min-h-10 min-w-10 place-items-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={hasActiveUploads ? '上传完成后关闭' : '关闭'}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </div>
          )}

          {existingMedia.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {existingMedia.map((media) => (
                <div key={media.id} className="relative aspect-square overflow-hidden rounded-xl border border-gray-100 bg-gray-100">
                  {media.mediaType === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 认证媒体由浏览器携带同源 Cookie 获取
                    <img
                      src={media.thumbnailUrl ?? media.url}
                      alt="旅行现场照片"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video src={media.url} controls preload="metadata" className="h-full w-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          )}

          {uploadingItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">上传队列</p>
              {uploadingItems.map((item) => {
                const active = !item.result && !item.error && item.progress > 0;
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white/70 p-2.5">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                      {item.file.type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Blob 预览不经过 Next 图片优化器
                        <img src={item.preview} alt="待上传预览" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-primary-700">
                          <Video aria-hidden="true" className="h-5 w-5" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-800">{item.file.name}</p>
                      {item.error ? (
                        <div className="mt-1 flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs text-red-700">{item.error}</p>
                          <button type="button" onClick={() => void handleRetry(item)} className="inline-flex items-center gap-1 text-xs font-bold text-primary-700">
                            <RefreshCw aria-hidden="true" className="h-3 w-3" /> 重试
                          </button>
                        </div>
                      ) : item.result ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-green-700">
                          <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> 上传成功
                        </p>
                      ) : (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-primary-700 transition-[width] duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item)}
                      disabled={active}
                      className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      aria-label={`移除 ${item.file.name}`}
                    >
                      {active
                        ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                        : <X aria-hidden="true" className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {canAdd ? (
            <div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/x-m4v"
                multiple
                onChange={handleFileSelect}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/45 px-4 py-6 text-primary-800 transition-colors hover:border-primary-400 hover:bg-primary-50"
              >
                {existingMedia.length === 0
                  ? <ImagePlus aria-hidden="true" className="h-7 w-7" />
                  : <Upload aria-hidden="true" className="h-7 w-7" />}
                <span className="text-sm font-bold">添加照片或视频</span>
                <span className="text-xs font-normal text-gray-500">单个文件不超过 50 MB，最多同时上传 2 个</span>
              </button>
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
              已达到当前地点的媒体数量上限
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t border-white/70 px-5 py-4">
          <button type="button" onClick={requestClose} disabled={hasActiveUploads} className="button-primary w-full px-4">
            {hasActiveUploads ? '正在上传，请稍候…' : '完成'}
          </button>
        </footer>
      </section>
    </div>
  );
}
