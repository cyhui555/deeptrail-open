'use client';

import { Gem, PiggyBank, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface BudgetChipsProps {
  value?: string;
  onChange: (value: string) => void;
}

const BUDGET_OPTIONS: Array<{ label: string; value: string; icon: LucideIcon; desc: string }> = [
  { label: '节俭', value: '节俭', icon: PiggyBank, desc: '穷游/青旅' },
  { label: '中等', value: '中等', icon: WalletCards, desc: '舒适/酒店' },
  { label: '豪华', value: '豪华', icon: Gem, desc: '五星/任性' },
];

export function BudgetChips({ value, onChange }: BudgetChipsProps) {
  return (
    <div>
      <label className="field-label">预算</label>
      <div className="grid grid-cols-3 gap-2">
        {BUDGET_OPTIONS.map((opt) => {
          const active = value === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(active ? '' : opt.value)}
              className={`chip ${active ? 'chip--active' : ''}`}
              aria-pressed={active}
            >
              <Icon aria-hidden="true" className="h-4 w-4 text-primary-600" strokeWidth={1.8} />
              <span className="chip__label">{opt.label}</span>
              <span className="chip__desc">{opt.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
