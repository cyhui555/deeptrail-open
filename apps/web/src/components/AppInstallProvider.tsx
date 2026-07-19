'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type InstallOutcome = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

interface AppInstallContextValue {
  canInstall: boolean;
  install: () => Promise<InstallOutcome | 'unavailable'>;
}

const AppInstallContext = createContext<AppInstallContextValue | null>(null);

export function AppInstallProvider({ children }: { children: React.ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return undefined;

    const handleBeforeInstallPrompt = (event: Event) => {
      // 浏览器原生迷你信息栏由产品入口接管，只有用户主动点击时才请求安装。
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome | 'unavailable'> => {
    if (!installPrompt) return 'unavailable';

    const currentPrompt = installPrompt;
    // 同一事件只能消费一次；先清除可防止快速重复点击触发多个安装请求。
    setInstallPrompt(null);
    try {
      await currentPrompt.prompt();
      const choice = await currentPrompt.userChoice;
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, [installPrompt]);

  const value = useMemo(() => ({
    canInstall: installPrompt !== null,
    install,
  }), [install, installPrompt]);

  return (
    <AppInstallContext.Provider value={value}>
      {children}
    </AppInstallContext.Provider>
  );
}

export function useAppInstall(): AppInstallContextValue {
  const context = useContext(AppInstallContext);
  if (!context) throw new Error('useAppInstall 必须在 AppInstallProvider 内使用');
  return context;
}
