'use client';

import React, { useMemo, type ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  icon?: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  focusRingClass?: string;
}

export function FormField({
  label,
  icon,
  required,
  hint,
  error,
  children,
  focusRingClass = '',
}: FormFieldProps) {
  const id = useMemo(
    () => `field-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  const childrenWithProps = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string; className?: string }>, {
        id,
        className: `field-input ${(children.props as { className?: string }).className ?? ''}`.trim(),
      })
    : children;

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="field-label__required">*</span>}
      </label>
      <div className={`field-wrap ${focusRingClass}`}>
        {icon && (
          <span className="field-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {childrenWithProps}
      </div>
      {error ? (
        <p className="field-error">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
