import { checkDatabaseHealth, listRecentAgentRuns } from "@/db/repositories/agent-runs.repository";
import { ClassifierTester } from "@/components/classifier-tester";

export const dynamic = "force-dynamic";

const DashboardPage = async () => {
  const [dbHealthy, recentRuns] = await Promise.all([checkDatabaseHealth(), listRecentAgentRuns(5)]);
  const successCount = recentRuns.filter((run) => run.status === "success").length;
  const failedCount = recentRuns.filter((run) => run.status === "failed").length;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">DB Health</p>
          <p className={`mt-2 text-2xl font-semibold ${dbHealthy ? "text-emerald-700" : "text-rose-700"}`}>
            {dbHealthy ? "OK" : "DOWN"}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Runs (últimos 5)</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{recentRuns.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Success / Failed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {successCount} / {failedCount}
          </p>
        </div>
      </div>
      <ClassifierTester />
    </section>
  );
};

export default DashboardPage;
