'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserInfo } from '@/types';
import {
  ApiError,
  apiLogin,
  apiLogout,
  clearTripPlansCache,
  fetchMe,
  preloadTripPlans,
} from '@/lib/api';
import { clearPersistentDrafts } from '@/hooks/usePersistentDraft';
import { clearOfflineData } from '@/lib/offlineSync';

async function clearDeviceSessionData(): Promise<void> {
  try {
    clearTripPlansCache();
    clearPersistentDrafts();
  } catch {
    // 内存与 localStorage 清理属于尽力而为，不能改变登录或退出结果。
  }
  await Promise.allSettled([clearOfflineData()]);
}

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  loggingOut: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  loggingOut: false,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    // 最多重试 2 次，总等待约 3 秒，避免白屏过久
    const maxRetries = 2;

    // 匿名页面已由 Middleware 限定精确路径，无需主动请求 /me 制造预期 401 或后端依赖。
    if (window.location.pathname === '/login' || window.location.pathname === '/globe-demo') {
      setUser(null);
      setLoading(false);
      return () => { cancelled = true; };
    }

    // 行程列表与认证均由后端 Cookie 校验。提前发起只读请求可消除首屏串行瀑布，
    // 同一个请求会被行程页复用；失效会话仍由 API 401 和 AuthGuard 完成清理与跳转。
    if (/^\/trips\/?$/.test(window.location.pathname)) {
      void preloadTripPlans().catch(() => undefined);
    }

    const attempt = () => {
      fetchMe()
        .then((user) => {
          if (!cancelled) {
            setUser(user);
            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // token 过期/无效（401）→ 后端已清理 Cookie，前端同步清空会话状态。
          if (err instanceof ApiError && err.status === 401) {
            void clearDeviceSessionData();
            setUser(null);
            setLoading(false);
            return;
          }
          // 其他错误（500、网络超时等）→ 短暂重试，避免白屏过久
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = 800 * retryCount; // 0.8s, 1.6s
            setTimeout(attempt, delay);
          } else {
            // 重试耗尽后仅清理本地会话状态；HttpOnly Cookie 只能由后端修改。
            setUser(null);
            setLoading(false);
          }
        });
    };

    attempt();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    await clearDeviceSessionData();
    setUser({
      userId: res.userId,
      username: res.username,
      role: res.role,
      enabled: true,
      wechatBound: false,
      createdAt: '',
    });
  }, []);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await apiLogout();
    } finally {
      await clearDeviceSessionData();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loggingOut, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
