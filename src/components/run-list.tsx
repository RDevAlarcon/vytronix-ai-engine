import Link from "next/link";
import type { AgentRunSelect } from "@/db/schema";
import { StatusPill } from "@/components/status-pill";

type RunListProps = {
  runs: AgentRunSelect[];
};

const qualityTone = (score: number | null) => {
  if (typeof score !== "number") {
    return "bg-slate-100 text-slate-700";
  }
  if (score >= 85) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (score >= 70) {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-rose-100 text-rose-700";
};

export const RunList = ({ runs }: RunListProps) => {
  if (runs.length === 0) {
    return <p className="text-sm text-slate-600">No hay ejecuciones todavia.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 font-medium text-slate-600">Agent</th>
            <th className="px-4 py-3 font-medium text-slate-600">Status</th>
            <th className="px-4 py-3 font-medium text-slate-600">Quality</th>
            <th className="px-4 py-3 font-medium text-slate-600">Feedback</th>
            <th className="px-4 py-3 font-medium text-slate-600">Mode</th>
            <th className="px-4 py-3 font-medium text-slate-600">Latency</th>
            <th className="px-4 py-3 font-medium text-slate-600">Model</th>
            <th className="px-4 py-3 font-medium text-slate-600">Created</th>
            <th className="px-4 py-3 font-medium text-slate-600">Detail</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-t border-slate-100">
              <td className="px-4 py-3 capitalize">{run.agentName}</td>
              <td className="px-4 py-3">
                <StatusPill status={run.status} />
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${qualityTone(run.qualityScore)}`}>
                  {typeof run.qualityScore === "number" ? `${run.qualityScore}/100` : "-"}
                </span>
              </td>
              <td className="px-4 py-3">{run.feedbackValue === "helpful" ? "util" : run.feedbackValue === "unhelpful" ? "no util" : "-"}</td>
              <td className="px-4 py-3">{run.speedMode ?? "-"}</td>
              <td className="px-4 py-3">{run.durationMs ? `${run.durationMs} ms` : "-"}</td>
              <td className="px-4 py-3">{run.model ?? "-"}</td>
              <td className="px-4 py-3">{new Date(run.createdAt).toLocaleString("es-CL")}</td>
              <td className="px-4 py-3">
                <Link className="text-brand-700 hover:underline" href={`/runs/${run.id}`}>
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
