'use client';

import { Maximize2, Minimize2 } from 'lucide-react';

interface Props {
  immersive: boolean;
  onToggle: () => void;
}

/**
 * 沉浸模式切换按钮。
 *
 * <p>右上角浮动按钮，切换时隐藏周边元素（元信息、优化表单等），
 * 让读者专注行程内容本身。图标在 ⊙（进入）和 ⊘（退出）之间切换。
 */
export function ImmersiveToggle({ immersive, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="fixed top-3 right-4 z-50 flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
      title={immersive ? '退出沉浸模式' : '进入沉浸模式'}
    >
      {immersive
        ? <Minimize2 aria-hidden="true" className="h-4 w-4" />
        : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
      <span className="hidden sm:inline">{immersive ? '退出' : '沉浸'}</span>
    </button>
  );
}
