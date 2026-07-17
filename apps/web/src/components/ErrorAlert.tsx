import { CircleAlert } from 'lucide-react';

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50/90 p-4 text-red-800">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
      <div>
        <p className="font-semibold">遇到问题</p>
        <p className="mt-0.5 text-sm leading-5">{message}</p>
      </div>
    </div>
  );
}
