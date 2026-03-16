import Link from "next/link";

const NotFoundPage = () => {
  return (
    <section className="card space-y-3">
      <h1 className="text-2xl font-semibold text-slate-900">Registro no encontrado</h1>
      <p className="text-sm text-slate-600">
        El recurso solicitado no existe o no está disponible porque la base de datos está desconectada.
      </p>
      <Link href="/runs" className="text-sm text-brand-700 hover:underline">
        Volver a runs
      </Link>
    </section>
  );
};

export default NotFoundPage;
