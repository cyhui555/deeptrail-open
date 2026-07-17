'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Power,
  PowerOff,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { ModalDialog } from '@/components/ModalDialog';
import { useAppFeedback } from '@/components/FeedbackProvider';
import { useAuth } from '@/contexts/AuthContext';
import {
  createAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUserStatus,
} from '@/lib/api';
import type { AdminUser, PageResult } from '@/types';

type DialogState = { type: 'create' } | { type: 'reset'; user: AdminUser } | null;

const EMPTY_PAGE: PageResult<AdminUser> = {
  records: [],
  total: 0,
  page: 1,
  size: 20,
  totalPages: 0,
};

function formatDate(value: string): string {
  if (!value) return '未知';
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { confirmAction, notify } = useAppFeedback();
  const [users, setUsers] = useState<PageResult<AdminUser>>(EMPTY_PAGE);
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchAdminUsers(keyword, page));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '用户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const closeDialog = () => {
    if (submitting) return;
    setDialog(null);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const openCreateDialog = () => {
    setDialog({ type: 'create' });
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const openResetDialog = (target: AdminUser) => {
    setDialog({ type: 'reset', user: target });
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setKeyword(query.trim());
  };

  const validatePassword = (): boolean => {
    if (password.length < 6) {
      setFormError('密码至少需要 6 个字符');
      return false;
    }
    if (password !== confirmPassword) {
      setFormError('两次输入的密码不一致');
      return false;
    }
    return true;
  };

  const handleDialogSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validatePassword() || !dialog) return;
    if (dialog.type === 'create' && username.trim().length < 3) {
      setFormError('用户名至少需要 3 个字符');
      return;
    }

    setSubmitting(true);
    try {
      if (dialog.type === 'create') {
        await createAdminUser(username.trim(), password);
        notify(`已分配账号 ${username.trim()}`, 'success');
        setPage(1);
      } else {
        await resetAdminUserPassword(dialog.user.userId, password);
        notify(`已重置 ${dialog.user.username} 的密码`, 'success');
      }
      setDialog(null);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      await loadUsers();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (target: AdminUser) => {
    const nextEnabled = !target.enabled;
    const accepted = await confirmAction({
      title: nextEnabled ? '启用这个账号？' : '停用这个账号？',
      description: nextEnabled
        ? `${target.username} 将可以重新登录并访问自己的行程。`
        : `${target.username} 的当前会话会立即失效，但已有行程不会删除。`,
      confirmLabel: nextEnabled ? '确认启用' : '确认停用',
      danger: !nextEnabled,
    });
    if (!accepted) return;

    try {
      const updated = await updateAdminUserStatus(target.userId, nextEnabled);
      setUsers((current) => ({
        ...current,
        records: current.records.map((item) => item.userId === updated.userId ? updated : item),
      }));
      notify(nextEnabled ? '账号已启用' : '账号已停用', 'success');
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : '账号状态更新失败', 'error');
    }
  };

  const renderActions = (target: AdminUser) => {
    const isAdmin = target.role === 'ADMIN';
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={isAdmin}
          onClick={() => openResetDialog(target)}
          className="button-secondary min-h-10 gap-1.5 px-3 text-xs"
        >
          <KeyRound aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.9} />
          重置密码
        </button>
        <button
          type="button"
          disabled={isAdmin}
          onClick={() => void handleStatusChange(target)}
          className={target.enabled
            ? 'button-danger min-h-10 gap-1.5 px-3 text-xs'
            : 'button-secondary min-h-10 gap-1.5 px-3 text-xs'}
        >
          {target.enabled
            ? <PowerOff aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.9} />
            : <Power aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.9} />}
          {target.enabled ? '停用' : '启用'}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary-800">
          <ShieldCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
          后台运营
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-gray-950 sm:text-4xl">
          用户管理
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          统一分配旅行账号，控制访问状态，并在需要时重置用户密码。
        </p>
      </header>

      <section className="glass-light grid gap-3 rounded-2xl p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <form onSubmit={handleSearch} className="flex min-w-0 gap-2">
          <label htmlFor="user-search" className="sr-only">搜索用户名</label>
          <div className="field-wrap min-w-0 flex-1 py-2.5">
            <Search aria-hidden="true" className="field-icon" strokeWidth={1.8} />
            <input
              id="user-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field-input"
              placeholder="搜索用户名"
            />
          </div>
          <button type="submit" className="button-secondary min-h-11 shrink-0 px-4">搜索</button>
        </form>
        <button
          type="button"
          onClick={openCreateDialog}
          className="button-primary min-h-11 gap-2 px-4"
        >
          <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
          分配账号
        </button>
      </section>

      <section className="glass-strong overflow-hidden rounded-2xl" aria-busy={loading}>
        <div className="flex items-center justify-between gap-4 border-b border-white/70 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <UsersRound aria-hidden="true" className="h-5 w-5 text-primary-700" strokeWidth={1.8} />
            <h2 className="font-bold text-gray-950">账号列表</h2>
          </div>
          <p className="text-xs text-gray-500">共 {users.total} 个账号</p>
        </div>

        {loading ? (
          <div aria-label="正在加载用户列表" className="space-y-3 p-4 sm:p-5">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-xl bg-white/55" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
            <button type="button" onClick={() => void loadUsers()} className="button-secondary mt-4 px-4">
              重新加载
            </button>
          </div>
        ) : users.records.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <UsersRound aria-hidden="true" className="mx-auto h-9 w-9 text-gray-400" strokeWidth={1.5} />
            <p className="mt-4 font-bold text-gray-900">{keyword ? '没有匹配的账号' : '还没有普通用户'}</p>
            <p className="mt-1 text-sm text-gray-500">
              {keyword ? '换一个用户名关键字再试。' : '点击“分配账号”为第一位用户开通访问。'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] table-fixed text-left">
                <thead className="bg-white/35 text-xs font-semibold text-gray-500">
                  <tr>
                    <th scope="col" className="w-[30%] px-5 py-3">用户</th>
                    <th scope="col" className="w-[14%] px-4 py-3">角色</th>
                    <th scope="col" className="w-[14%] px-4 py-3">状态</th>
                    <th scope="col" className="w-[16%] px-4 py-3">分配时间</th>
                    <th scope="col" className="w-[26%] px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.records.map((target) => (
                    <tr key={target.userId} className="border-t border-white/65">
                      <td className="px-5 py-4">
                        <p className="truncate text-sm font-bold text-gray-950">{target.username}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          ID {target.userId}{target.userId === currentUser?.userId ? '，当前账号' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {target.role === 'ADMIN' ? '管理员' : '普通用户'}
                      </td>
                      <td className="px-4 py-4">
                        <span className={target.enabled ? 'badge badge--success' : 'badge badge--muted'}>
                          {target.enabled ? '已启用' : '已停用'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{formatDate(target.createdAt)}</td>
                      <td className="px-5 py-4">{renderActions(target)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {users.records.map((target) => (
                <article key={target.userId} className="rounded-xl bg-white/55 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-gray-950">{target.username}</h3>
                      <p className="mt-1 text-xs text-gray-500">ID {target.userId}，{formatDate(target.createdAt)}</p>
                    </div>
                    <span className={target.enabled ? 'badge badge--success' : 'badge badge--muted'}>
                      {target.enabled ? '已启用' : '已停用'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-gray-600">
                    {target.role === 'ADMIN' ? '管理员' : '普通用户'}
                  </p>
                  <div className="mt-4 border-t border-gray-200/70 pt-3">{renderActions(target)}</div>
                </article>
              ))}
            </div>
          </>
        )}

        {!loading && !error && users.totalPages > 1 && (
          <nav aria-label="用户列表分页" className="flex items-center justify-between border-t border-white/70 px-4 py-3 sm:px-5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="button-secondary min-h-10 gap-1 px-3 text-xs"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              上一页
            </button>
            <span className="text-xs font-semibold text-gray-600">第 {page} / {users.totalPages} 页</span>
            <button
              type="button"
              disabled={page >= users.totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="button-secondary min-h-10 gap-1 px-3 text-xs"
            >
              下一页
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </nav>
        )}
      </section>

      <ModalDialog
        open={dialog !== null}
        onClose={closeDialog}
        dismissDisabled={submitting}
        labelledBy="admin-user-dialog-title"
        describedBy="admin-user-dialog-description"
        panelClassName="max-w-md overflow-hidden bg-surface"
      >
        <form onSubmit={handleDialogSubmit}>
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
            <div>
              <h2 id="admin-user-dialog-title" className="text-lg font-bold text-gray-950">
                {dialog?.type === 'reset' ? '重置用户密码' : '分配新账号'}
              </h2>
              <p id="admin-user-dialog-description" className="mt-1 text-sm leading-5 text-gray-500">
                {dialog?.type === 'reset'
                  ? `为 ${dialog.user.username} 设置新的登录密码。`
                  : '创建后，用户可立即使用用户名和初始密码登录。'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              aria-label="关闭对话框"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            {formError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {formError}
              </p>
            )}
            {dialog?.type === 'create' && (
              <div>
                <label htmlFor="admin-username" className="auth-label">用户名</label>
                <input
                  id="admin-username"
                  data-autofocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                  className="auth-input"
                  placeholder="3-50 个字符"
                />
              </div>
            )}
            <div>
              <label htmlFor="admin-password" className="auth-label">新密码</label>
              <input
                id="admin-password"
                data-autofocus={dialog?.type === 'reset' ? true : undefined}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                className="auth-input"
                placeholder="至少 6 个字符"
              />
            </div>
            <div>
              <label htmlFor="admin-confirm-password" className="auth-label">确认密码</label>
              <input
                id="admin-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="auth-input"
                placeholder="再次输入密码"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-gray-200 px-5 py-4">
            <button type="button" onClick={closeDialog} disabled={submitting} className="button-secondary px-4">
              取消
            </button>
            <button type="submit" disabled={submitting} className="button-primary px-4">
              {submitting ? '提交中...' : dialog?.type === 'reset' ? '确认重置' : '创建账号'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
