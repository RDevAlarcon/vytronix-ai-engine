import { RunList } from "@/components/run-list";
import { checkDatabaseHealth, listRecentAgentRuns } from "@/db/repositories/agent-runs.repository";

export const dynamic = "force-dynamic";

const RunsPage = async () => {
  const [dbHealthy, runs] = await Promise.all([checkDatabaseHealth(), listRecentAgentRuns(50)]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Recent Runs</h1>
      {!dbHealthy ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          PostgreSQL no está disponible. No se pueden listar ejecuciones.
        </p>
      ) : null}
      <RunList runs={runs} />
    </section>
  );
};

export default RunsPage;
