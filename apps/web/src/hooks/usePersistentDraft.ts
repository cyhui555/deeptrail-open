'use client';

import { useCallback, useEffect, useState } from 'react';

const DRAFT_PREFIX = 'travel-user-draft:';

/**
 * 将表单草稿保存在当前浏览器，刷新或意外离开后可继续填写。
 * 读取失败和存储配额不足都静默降级，不能影响主表单提交。
 */
export function usePersistentDraft<T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // 私密模式或配额不足时保留内存草稿，提交能力不受影响。
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storageKey, value]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // 清理失败不阻塞用户继续使用。
    }
    setValue(initialValue);
  }, [initialValue, storageKey]);

  return [value, setValue, clear];
}

/** 退出登录或切换用户时清除全部表单草稿，避免共享设备泄露上个用户输入。 */
export function clearPersistentDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(DRAFT_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // 浏览器禁用存储时无需额外处理。
  }
}
