import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonViewer } from "@/components/json-viewer";
import { RunFeedbackForm } from "@/components/run-feedback-form";
import { getAgentRunById } from "@/db/repositories/agent-runs.repository";

export const dynamic = "force-dynamic";

type RunDetailPageProps = {
  params: Promise<{ id: string }>;
};

const RunDetailPage = async ({ params }: RunDetailPageProps) => {
  const { id } = await params;
  const run = await getAgentRunById(id);

  if (!run) {
    notFound();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Run Detail</h1>
        <Link href="/runs" className="text-sm text-brand-700 hover:underline">
          Volver
        </Link>
      </div>

      <div className="card space-y-2 text-sm text-slate-700">
        <p>
          <strong>ID:</strong> <span className="font-mono">{run.id}</span>
        </p>
        <p>
          <strong>Agent:</strong> {run.agentName}
        </p>
        <p>
          <strong>Status:</strong> {run.status}
        </p>
        <p>
          <strong>Quality Score:</strong> {typeof run.qualityScore === "number" ? `${run.qualityScore}/100` : "-"}
        </p>
        <p>
          <strong>Quality Flags:</strong> {Array.isArray(run.qualityFlags) ? run.qualityFlags.join(", ") : "-"}
        </p>
        <p>
          <strong>Improvement Signals:</strong> {Array.isArray(run.improvementSignals) ? run.improvementSignals.join(", ") : "-"}
        </p>
        <p>
          <strong>Feedback:</strong> {run.feedbackValue ?? "-"}
        </p>
        <p>
          <strong>Model:</strong> {run.model ?? "-"}
        </p>
        <p>
          <strong>Provider:</strong> {run.provider ?? "-"}
        </p>
        <p>
          <strong>Mode:</strong> {run.speedMode ?? "-"}
        </p>
        <p>
          <strong>Attempt Count:</strong> {run.attemptCount}
        </p>
        <p>
          <strong>Duration:</strong> {run.durationMs ? `${run.durationMs} ms` : "-"}
        </p>
        <p>
          <strong>Created:</strong> {new Date(run.createdAt).toLocaleString("es-CL")}
        </p>
      </div>

      <RunFeedbackForm
        runId={run.id}
        initialFeedbackValue={run.feedbackValue}
        initialFeedbackComment={run.feedbackComment}
      />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Input</h2>
        <JsonViewer value={run.input} />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Parsed Output</h2>
        <JsonViewer value={run.parsedOutput} />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Usage</h2>
        <JsonViewer value={run.usage} />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Raw Output</h2>
        <pre className="overflow-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">
          {run.rawOutput ?? "(sin raw output)"}
        </pre>
      </div>

      {run.errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <strong>Error:</strong> {run.errorMessage}
        </div>
      ) : null}
    </section>
  );
};

export default RunDetailPage;
