'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

const HOT_DESTINATIONS = [
  { name: '北京' },
  { name: '上海' },
  { name: '成都' },
  { name: '西安' },
  { name: '杭州' },
  { name: '重庆' },
  { name: '三亚' },
  { name: '大理' },
  { name: '厦门' },
  { name: '青岛' },
  { name: '桂林' },
  { name: '长沙' },
];

interface DestinationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  className?: string;
}

export function DestinationAutocomplete({
  value,
  onChange,
  onBlur,
  id,
  className,
}: DestinationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = HOT_DESTINATIONS.filter((c) =>
    c.name.includes(value.trim()),
  );

  useEffect(() => {
    if (!open) setHighlightIndex(-1);
  }, [open]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        onBlur?.();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onBlur]);

  function select(name: string) {
    onChange(name);
    setOpen(false);
    onBlur?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        select(filtered[highlightIndex].name);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        required
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={className}
        placeholder="例如：西安"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete-dropdown" role="listbox">
          {filtered.map((city, i) => (
            <div
              key={city.name}
              role="option"
              aria-selected={highlightIndex === i}
              className={`autocomplete-item ${
                highlightIndex === i ? 'autocomplete-item--highlighted' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                select(city.name);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" strokeWidth={1.8} />
              <span>{city.name}</span>
              <span className="autocomplete-item__badge">热门</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
