export function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-light rounded-2xl p-8 text-center text-gray-500">
      <p className="text-sm leading-6">{message}</p>
    </div>
  );
}
