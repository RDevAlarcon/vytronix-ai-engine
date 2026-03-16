import Link from "next/link";

const HomePage = () => {
  return (
    <section className="space-y-6">
      <div className="card space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Vytronix AI Engine</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Motor interno de agentes IA para automatizar procesos comerciales y operativos de Vytronix.
          Esta versión está optimizada para correr local-first con LM Studio.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/agents" className="card hover:border-brand-400">
          <h2 className="font-semibold">Run Agent</h2>
          <p className="mt-2 text-sm text-slate-600">Ejecuta Lead, Landing, Proposal o Support Agent.</p>
        </Link>
        <Link href="/runs" className="card hover:border-brand-400">
          <h2 className="font-semibold">Recent Runs</h2>
          <p className="mt-2 text-sm text-slate-600">Revisa trazabilidad de ejecuciones y errores.</p>
        </Link>
        <Link href="/dashboard" className="card hover:border-brand-400">
          <h2 className="font-semibold">Dashboard</h2>
          <p className="mt-2 text-sm text-slate-600">Vista rápida de estado de infraestructura interna.</p>
        </Link>
      </div>
    </section>
  );
};

export default HomePage;
