'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/** 客户端管理路由守卫；真正的权限边界仍由后端管理 API 执行。 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <div aria-label="正在验证管理员权限" className="space-y-4 animate-pulse">
        <div className="h-9 w-44 rounded-xl bg-white/55" />
        <div className="h-28 rounded-2xl bg-white/45" />
        <div className="h-72 rounded-2xl bg-white/45" />
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') return null;
  return <>{children}</>;
}
