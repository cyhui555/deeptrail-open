'use client';

import { CalendarDays, Fingerprint, Link2, LogOut, Phone, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      // 即使本地清理异常也完整加载公开页；HttpOnly Cookie 的结果仍由服务端退出接口决定。
      window.location.assign('/login');
    }
  };

  if (!user) return null;

  const createdAt = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '未知';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.045em] text-gray-950 sm:text-4xl">个人资料</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">管理你的旅迹身份与登录信息。</p>
      </div>

      <div className="glass-strong rounded-2xl px-5 py-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-700 text-xl font-bold text-white shadow-card sm:h-16 sm:w-16 sm:text-2xl">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="break-words text-xl font-bold tracking-[-0.025em] text-gray-900">{user.username}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500">
              <UserRound aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
              {user.wechatBound ? '已绑定微信' : '用户名登录'}
            </p>
          </div>
        </div>
      </div>

      <dl className="glass-light grid gap-3 rounded-2xl p-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/55 p-4">
            <dt className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <Fingerprint aria-hidden="true" className="h-4 w-4 text-primary-600" strokeWidth={1.8} />
              用户 ID
            </dt>
            <dd className="mt-2 break-all font-mono text-sm font-semibold text-gray-900">{user.userId}</dd>
          </div>
          {user.phone && (
            <div className="rounded-xl bg-white/55 p-4">
              <dt className="flex items-center gap-2 text-xs font-medium text-gray-500">
                <Phone aria-hidden="true" className="h-4 w-4 text-primary-600" strokeWidth={1.8} />
                手机号
              </dt>
              <dd className="mt-2 text-sm font-semibold text-gray-900">{user.phone}</dd>
            </div>
          )}
          <div className="rounded-xl bg-white/55 p-4">
            <dt className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <CalendarDays aria-hidden="true" className="h-4 w-4 text-primary-600" strokeWidth={1.8} />
              注册时间
            </dt>
            <dd className="mt-2 text-sm font-semibold text-gray-900">{createdAt}</dd>
          </div>
          <div className="rounded-xl bg-white/55 p-4">
            <dt className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <Link2 aria-hidden="true" className="h-4 w-4 text-primary-600" strokeWidth={1.8} />
              微信绑定
            </dt>
            <dd className={`mt-2 text-sm font-semibold ${user.wechatBound ? 'text-green-700' : 'text-gray-500'}`}>
              {user.wechatBound ? '已绑定' : '未绑定'}
            </dd>
          </div>
      </dl>

      <button
        onClick={handleLogout}
        className="glass-light tap-active flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50/70 active:bg-red-50"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
        退出登录
      </button>
    </div>
  );
}
