import { Route } from 'lucide-react';

interface BrandProps {
  compact?: boolean;
  className?: string;
}

/** “旅迹”统一品牌标识，图形沿用项目现有 Lucide 图标体系。 */
export function Brand({ compact = false, className = '' }: BrandProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <span className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`} aria-hidden="true">
        <Route strokeWidth={1.8} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`${compact ? 'text-lg' : 'text-2xl'} font-bold tracking-[-0.06em] text-gray-950 [font-family:var(--font-editorial)]`}>
          旅迹
        </span>
        {!compact && (
          <span className="mt-0.5 text-xs tracking-[0.08em] text-gray-500">
            让旅程有迹可循
          </span>
        )}
      </span>
    </div>
  );
}
