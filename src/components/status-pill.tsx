type StatusPillProps = {
  status: string;
};

const styles: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700"
};

export const StatusPill = ({ status }: StatusPillProps) => {
  const className = styles[status] ?? "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
};
