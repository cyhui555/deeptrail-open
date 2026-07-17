'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, loggingOut } = useAuth();

  useEffect(() => {
    if (!loading && !user && !loggingOut) {
      const redirect = window.location.pathname;
      // 会话失效跨越认证边界，完整导航避免旧 RSC 请求与退出跳转竞态。
      window.location.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
    }
  }, [user, loading, loggingOut]);

  if (loading) {
    // 中间件已拦截没有认证 Cookie 的直接访问，业务 API 仍会校验有效会话与用户归属。
    // 认证确认期间先渲染页面自身的加载态，避免已返回的行程数据继续被全屏骨架遮挡。
    return <>{children}</>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
