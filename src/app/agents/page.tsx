import { AgentRunner } from "@/components/agent-runner";

const AgentsPage = () => {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Run Agent</h1>
      <p className="text-sm text-slate-600">
        Puedes probar todos los agentes con JSON editable. Incluye ejemplos para Lead y Landing listos para ejecutar.
      </p>
      <AgentRunner />
    </section>
  );
};

export default AgentsPage;
