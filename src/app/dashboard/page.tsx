import { checkDatabaseHealth, getRunLearningSummary, listRecentAgentRuns, listRunsNeedingReview } from "@/db/repositories/agent-runs.repository";
import { ClassifierTester } from "@/components/classifier-tester";

export const dynamic = "force-dynamic";

const DashboardPage = async () => {
  const [dbHealthy, recentRuns, learning, reviewQueue] = await Promise.all([
    checkDatabaseHealth(),
    listRecentAgentRuns(5),
    getRunLearningSummary(),
    listRunsNeedingReview(5)
  ]);
  const successCount = recentRuns.filter((run) => run.status === "success").length;
  const failedCount = recentRuns.filter((run) => run.status === "failed").length;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="card">
          <p className="text-sm text-slate-500">DB Health</p>
          <p className={`mt-2 text-2xl font-semibold ${dbHealthy ? "text-emerald-700" : "text-rose-700"}`}>
            {dbHealthy ? "OK" : "DOWN"}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Runs (ultimos 5)</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{recentRuns.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Success / Failed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {successCount} / {failedCount}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Quality Promedio</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{learning.avgQualityScore}/100</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Feedback Util / No util</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {learning.helpfulCount} / {learning.unhelpfulCount}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Review Queue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{learning.needsReviewCount}</p>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Learning Signals</h2>
            <p className="text-sm text-slate-600">Base minima para mejorar decisiones, detectar conversaciones fallidas y ajustar prompts.</p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>Total runs: {learning.totalRuns}</p>
            <p>Feedback capturado: {learning.feedbackCount}</p>
          </div>
        </div>
        {reviewQueue.length === 0 ? (
          <p className="text-sm text-slate-600">No hay runs con score bajo para revisar.</p>
        ) : (
          <div className="space-y-2">
            {reviewQueue.map((run) => (
              <div key={run.id} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium capitalize text-slate-900">{run.agentName}</p>
                    <p>Score: {run.qualityScore ?? "-"}/100</p>
                    <p>Flags: {Array.isArray(run.qualityFlags) ? run.qualityFlags.join(", ") : "-"}</p>
                  </div>
                  <a className="text-brand-700 hover:underline" href={`/runs/${run.id}`}>
                    Abrir run
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ClassifierTester />
    </section>
  );
};

export default DashboardPage;
