'use client';

import { useState } from 'react';

interface StarRatingProps {
  /** 当前评分（1-5）。 */
  value: number;
  /** 是否只读。 */
  readonly?: boolean;
  /** 评分变化回调。 */
  onChange?: (rating: number) => void;
  /** 星星大小，默认 'md'。 */
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
};

/** 星级评分组件，支持交互和只读模式。 */
export function StarRating({ value, readonly = false, onChange, size = 'md' }: StarRatingProps) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-0.5" role="group" aria-label="整体评分">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          aria-label={`${star} 星`}
          aria-pressed={star <= value}
          className={`${sizeMap[size]} ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform ${star <= (hover || value) ? 'text-yellow-400' : 'text-gray-300'}`}
          onClick={() => !readonly && onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
