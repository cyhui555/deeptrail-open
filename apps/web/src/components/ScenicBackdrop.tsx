import desktopScenery from '@/assets/travel-scenery-desktop.jpg';
import mobileScenery from '@/assets/travel-scenery-mobile.jpg';

/**
 * 全站装饰性风景背景。
 *
 * 横竖构图不是简单裁切关系，因此使用 picture 做艺术方向切换；
 * 静态 JPEG 已在入库前完成压缩，避免 standalone 和离线场景依赖运行时图片优化器。
 */
export function ScenicBackdrop() {
  return (
    <div className="scenic-backdrop" aria-hidden="true">
      <picture className="scenic-backdrop__picture">
        <source
          media="(max-width: 480px)"
          srcSet={mobileScenery.src}
        />
        <img
          src={desktopScenery.src}
          width={desktopScenery.width}
          height={desktopScenery.height}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="auto"
          className="scenic-backdrop__image"
        />
      </picture>
    </div>
  );
}
