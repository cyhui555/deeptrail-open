'use client';

import { useCallback, useEffect, useState } from 'react';

export type AMapLoaderError = 'missing-config' | 'script-error' | 'timeout' | null;

interface AMapLoaderState {
  loaded: boolean;
  error: AMapLoaderError;
  retry: () => void;
}

interface AMapWindow extends Window {
  AMap?: any;
  _AMapSecurityConfig?: Record<string, unknown>;
  __AMAP_PLUGINS_READY__?: boolean;
  __AMAP_LOAD_PROMISE__?: Promise<void>;
}

/** 当前组件只依赖比例尺和工具栏，搜索与地理编码统一走服务端代理。 */
const AMAP_PLUGINS = ['AMap.Scale', 'AMap.ToolBar'];
const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY;
const AMAP_SECURITY_CODE = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
const AMAP_VERSION = '2.0';
const AMAP_SCRIPT_ID = 'amap-js-api';
const AMAP_LOAD_TIMEOUT_MS = 8_000;

class AMapLoadFailure extends Error {
  constructor(readonly reason: Exclude<AMapLoaderError, null>) {
    super(reason);
    this.name = 'AMapLoadFailure';
  }
}

function asLoaderError(error: unknown): Exclude<AMapLoaderError, null> {
  return error instanceof AMapLoadFailure ? error.reason : 'script-error';
}

function loadPlugins(w: AMapWindow): Promise<void> {
  if (w.__AMAP_PLUGINS_READY__ && w.AMap) return Promise.resolve();
  if (!w.AMap) return Promise.reject(new AMapLoadFailure('script-error'));

  if (typeof w.AMap.plugin !== 'function') {
    w.__AMAP_PLUGINS_READY__ = true;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    w.AMap.plugin(AMAP_PLUGINS, () => {
      w.__AMAP_PLUGINS_READY__ = true;
      resolve();
    });
  });
}

/**
 * 共享同一个 SDK 加载 Promise，避免多个地图组件重复插入脚本或重复加载插件。
 * 超时覆盖核心脚本和插件两个阶段，失败后会清理 Promise，允许用户主动重试。
 */
function loadAMapSdk(): Promise<void> {
  if (!AMAP_KEY || !AMAP_SECURITY_CODE) {
    return Promise.reject(new AMapLoadFailure('missing-config'));
  }

  const w = window as AMapWindow;
  w._AMapSecurityConfig = {
    ...(w._AMapSecurityConfig || {}),
    securityJsCode: AMAP_SECURITY_CODE,
  };

  if (w.__AMAP_PLUGINS_READY__ && w.AMap) return Promise.resolve();
  if (w.__AMAP_LOAD_PROMISE__) return w.__AMAP_LOAD_PROMISE__;

  const loading = new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new AMapLoadFailure('timeout'));
    }, AMAP_LOAD_TIMEOUT_MS);

    const finish = (result: Promise<void>) => {
      result.then(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve();
      }).catch((error: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      });
    };

    if (w.AMap) {
      finish(loadPlugins(w));
      return;
    }

    let script = document.getElementById(AMAP_SCRIPT_ID) as HTMLScriptElement | null;
    const handleLoad = () => {
      if (script) script.dataset.loaded = 'true';
      finish(loadPlugins(w));
    };
    const handleError = () => finish(Promise.reject(new AMapLoadFailure('script-error')));

    if (script) {
      if (script.dataset.loaded === 'true') {
        handleError();
        return;
      }
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      return;
    }

    script = document.createElement('script');
    script.id = AMAP_SCRIPT_ID;
    script.src = `https://webapi.amap.com/maps?v=${AMAP_VERSION}&key=${AMAP_KEY}`;
    script.async = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });

  w.__AMAP_LOAD_PROMISE__ = loading.catch((error: unknown) => {
    delete w.__AMAP_LOAD_PROMISE__;
    throw error;
  });
  return w.__AMAP_LOAD_PROMISE__;
}

function resetAMapLoader(): void {
  const w = window as AMapWindow;
  delete w.__AMAP_LOAD_PROMISE__;
  delete w.__AMAP_PLUGINS_READY__;

  // 核心对象不存在时说明脚本没有成功执行，移除失败节点后才能重新发起请求。
  if (!w.AMap) {
    document.getElementById(AMAP_SCRIPT_ID)?.remove();
  }
}

/** 高德地图 JS API 动态加载 Hook。 */
export function useAMapLoader(): AMapLoaderState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<AMapLoaderState, 'retry'>>(() => {
    if (typeof window === 'undefined') return { loaded: false, error: null };
    const w = window as AMapWindow;
    return w.__AMAP_PLUGINS_READY__ && w.AMap
      ? { loaded: true, error: null }
      : { loaded: false, error: null };
  });

  useEffect(() => {
    let active = true;
    setState({ loaded: false, error: null });

    loadAMapSdk()
      .then(() => {
        if (active) setState({ loaded: true, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const reason = asLoaderError(error);
        console.warn(`[AMap] 地图加载失败：${reason}`);
        setState({ loaded: false, error: reason });
      });

    return () => { active = false; };
  }, [attempt]);

  const retry = useCallback(() => {
    resetAMapLoader();
    setAttempt((value) => value + 1);
  }, []);

  return { ...state, retry };
}

export function getAMapErrorCopy(error: Exclude<AMapLoaderError, null>): {
  title: string;
  description: string;
} {
  if (error === 'missing-config') {
    return {
      title: '地图配置未完成',
      description: '请补充高德 Web 端配置并重新启动页面。',
    };
  }
  if (error === 'timeout') {
    return {
      title: '地图加载超时',
      description: '当前网络响应较慢，可以直接重试。',
    };
  }
  return {
    title: '地图连接失败',
    description: '高德地图脚本未能加载，请检查网络后重试。',
  };
}
