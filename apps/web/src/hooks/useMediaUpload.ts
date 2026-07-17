'use client';

import { useCallback, useState } from 'react';
import { uploadMedia } from '@/lib/api';
import type { CheckinMedia } from '@/types';

interface UseMediaUploadResult {
  /** 上传单个文件 */
  upload: (itemId: number, file: File) => Promise<CheckinMedia>;
  /** 是否正在上传 */
  uploading: boolean;
  /** 错误信息 */
  error: string | null;
}

/**
 * 媒体上传 Hook。
 *
 * <p>封装文件上传逻辑，支持上传状态跟踪和错误处理。
 * 上传前校验文件类型和大小。
 */
export function useMediaUpload(): UseMediaUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (itemId: number, file: File): Promise<CheckinMedia> => {
    // 文件类型校验
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic',
      'video/mp4', 'video/quicktime', 'video/x-m4v'];
    if (!allowedTypes.includes(file.type)) {
      setError('不支持的文件类型');
      throw new Error('不支持的文件类型');
    }

    // 文件大小校验（图片 50MB，视频 200MB）
    const maxSize = file.type.startsWith('video/') ? 200 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('文件大小超出限制');
      throw new Error('文件大小超出限制');
    }

    setUploading(true);
    setError(null);
    try {
      const result = await uploadMedia(itemId, file);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setError(msg);
      throw e;
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading, error };
}
