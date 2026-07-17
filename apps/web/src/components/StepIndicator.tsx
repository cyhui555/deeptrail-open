'use client';

import { Check } from 'lucide-react';

interface Step {
  title: string;
}

interface StepIndicatorProps {
  steps: Step[];
  current: number;
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div
      className="flex items-center justify-between px-2 pb-3 pt-1"
      role="list"
      aria-label="步骤进度"
    >
      {steps.map((step, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === current;
        const isDone = stepNumber < current;

        return (
          <div key={step.title} className="flex items-center flex-1" role="listitem">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                  isDone
                    ? 'bg-primary-700 text-white'
                    : isActive
                      ? 'bg-primary-100 text-primary-800 ring-2 ring-primary-400'
                      : 'bg-gray-100 text-gray-400'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.2} /> : stepNumber}
              </div>
              <span
                className={`text-[10px] font-medium text-center whitespace-nowrap ${
                  isActive ? 'text-primary-800' : isDone ? 'text-primary-700' : 'text-gray-400'
                }`}
              >
                {step.title}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-12px] transition-colors duration-200 ${
                  stepNumber < current ? 'bg-primary-400' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
