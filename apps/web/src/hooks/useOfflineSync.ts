'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { syncAll } from '@/lib/offlineSync';

/**
 * 自动同步离线数据的 Hook。
 *
 * <p>在网络恢复时自动同步 IndexedDB 中暂存的打卡和轨迹数据。
 * 提供网络在线状态供 UI 展示。
 */
export function useOfflineSync(): {
  syncing: boolean;
  isOnline: boolean;
  lastSyncResult: { checkins: number; tracks: number } | null;
  manualSync: () => Promise<void>;
} {
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncResult, setLastSyncResult] = useState<{ checkins: number; tracks: number } | null>(null);

  // 使用 ref 追踪同步锁，避免将 syncing 作为 useCallback 依赖导致 effect 循环触发。
  const syncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await syncAll();
      setLastSyncResult(result);
    } catch {
      // 忽略
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // SSR 与浏览器首帧统一按在线渲染；挂载后再读取真实状态，避免 navigator.onLine 造成水合差异。
    const onlineOnMount = navigator.onLine;
    setIsOnline(onlineOnMount);
    if (onlineOnMount) sync();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync]);

  return { syncing, isOnline, lastSyncResult, manualSync: sync };
}
