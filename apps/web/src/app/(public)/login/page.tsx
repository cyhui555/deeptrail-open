'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/AuthShell';

export default function LoginPage() {
  const { login, logout } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearingSession, setClearingSession] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // 硬导航后服务端 HTML 会早于 React hydration 可交互；提前输入会被受控状态重置。
    // hydration 完成前禁用表单，避免快速用户和自动化提交空凭据。
    setHydrated(true);
  }, []);

  const handleClearSession = async () => {
    setError(null);
    setClearingSession(true);
    try {
      await logout();
      window.location.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除登录状态失败');
      setClearingSession(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      const params = new URLSearchParams(window.location.search);
      const requestedRedirect = params.get('redirect');
      const redirect = requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//')
        ? requestedRedirect
        : '/';
      // 登录会跨越匿名与认证资源边界，完整导航可同时避开旧构建的客户端路由清单。
      window.location.assign(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="登录旅迹"
      description="继续整理你的下一段旅程。"
      footer={(
        <div className="space-y-2">
          <p>账号由管理员统一分配，如需开通请联系管理员。</p>
          <button
            type="button"
            disabled={!hydrated || clearingSession || loading}
            onClick={() => void handleClearSession()}
            className="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {clearingSession ? '正在清除...' : '清除当前登录状态'}
          </button>
        </div>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="auth-label">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={!hydrated || loading}
              className="auth-input"
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label htmlFor="password" className="auth-label">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={!hydrated || loading}
              className="auth-input"
              placeholder="请输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={!hydrated || loading}
            className="button-primary w-full"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
    </AuthShell>
  );
}
