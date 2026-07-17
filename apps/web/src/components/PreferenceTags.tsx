'use client';

import { useState } from 'react';
import {
  Baby,
  Camera,
  Coffee,
  Compass,
  Landmark,
  ShoppingBag,
  Trees,
  UtensilsCrossed,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PreferenceTagsProps {
  value: string[];
  onChange: (tags: string[]) => void;
  maxVisible?: number;
}

const PREFERENCE_TAGS: Array<{ label: string; icon: LucideIcon }> = [
  { label: '美食', icon: UtensilsCrossed },
  { label: '历史', icon: Landmark },
  { label: '自然', icon: Trees },
  { label: '亲子', icon: Baby },
  { label: '购物', icon: ShoppingBag },
  { label: '网红打卡', icon: Camera },
  { label: '小众深度', icon: Compass },
  { label: '休闲放松', icon: Coffee },
];

export function PreferenceTags({
  value,
  onChange,
  maxVisible = 4,
}: PreferenceTagsProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleOptions = expanded
    ? PREFERENCE_TAGS
    : PREFERENCE_TAGS.slice(0, maxVisible);
  const canCollapse = PREFERENCE_TAGS.length > maxVisible && !expanded;

  function toggle(label: string) {
    if (value.includes(label)) {
      onChange(value.filter((t) => t !== label));
    } else {
      onChange([...value, label]);
    }
  }

  return (
    <div>
      <label className="field-label">旅行偏好（可多选）</label>
      <div className="flex flex-wrap gap-2">
        {visibleOptions.map((tag) => {
          const active = value.includes(tag.label);
          const Icon = tag.icon;
          return (
            <button
              key={tag.label}
              type="button"
              onClick={() => toggle(tag.label)}
              className={`tag ${active ? 'tag--active' : ''}`}
              aria-pressed={active}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
              {tag.label}
            </button>
          );
        })}
        {canCollapse && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="tag"
          >
            展开全部 →
          </button>
        )}
      </div>
    </div>
  );
}
