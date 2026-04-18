import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="font-heading text-5xl font-bold text-sunhub-primary">
          SunHub ⚡
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Plataforma unificada de operación solar para Techos Rentables
        </p>
        <p className="mt-2 text-sm text-slate-500">
          200+ plantas · 6 marcas · 1 sistema operativo
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl bg-sunhub-primary px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-green-700"
          >
            Ir al Dashboard →
          </Link>
          <Link
            href="/deye-demo"
            className="rounded-xl border border-green-600 bg-slate-900 px-6 py-3 font-semibold text-green-400 shadow-sm transition hover:bg-slate-800"
          >
            Demo DeyeCloud ⚡
          </Link>
          <a
            href="https://techos.thetribu.dev"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            target="_blank"
            rel="noreferrer"
          >
            Middleware Tinku
          </a>
        </div>

        <div className="mt-12 rounded-2xl bg-white p-6 text-left shadow-sm">
          <h2 className="font-heading text-lg font-semibold">
            Estado del bootstrap
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>✅ Next.js + Tailwind configurados</li>
            <li>✅ Design system SunHub cargado</li>
            <li>⏳ Middleware ping — ejecuta <code>npm run mw:ping</code></li>
            <li>⏳ Postgres + Prisma — ver README</li>
            <li>⏳ Ingestión en tiempo real</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
