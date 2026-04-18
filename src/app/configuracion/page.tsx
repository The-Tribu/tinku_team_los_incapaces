import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { AppShell } from "@/components/sunhub/app-shell";
import { getSessionUser, canWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPolicyView } from "@/lib/policies";

export const dynamic = "force-dynamic";

function levelBadge(level: string | undefined) {
  if (level === "auto") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
        <ShieldAlert className="h-3 w-3" /> Automático
      </span>
    );
  }
  if (level === "approval") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <ShieldCheck className="h-3 w-3" /> Con aprobación
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <ShieldX className="h-3 w-3" /> Manual
    </span>
  );
}

function modeBadge(mode: string | undefined) {
  const isReal = mode === "real";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (isReal ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200")
      }
    >
      {isReal ? "REAL" : "MOCK"}
    </span>
  );
}

export default async function ConfiguracionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canWrite(user)) redirect("/dashboard");

  const plants = await prisma.plant.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      client: { select: { name: true } },
      policy: true,
      _count: { select: { remediations: true } },
    },
  });

  return (
    <AppShell
      title="Configuración · Automatización por planta"
      subtitle="Define qué comandos puede sugerir y ejecutar SunHub, con toggle entre simulación y ejecución real"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Planta</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Nivel de autonomía</th>
              <th className="px-4 py-3">Modo de ejecución</th>
              <th className="px-4 py-3">Comandos permitidos</th>
              <th className="px-4 py-3 text-right">Remediaciones</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plants.map((p) => {
              const policy = p.policy ? toPolicyView(p.policy) : null;
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-[11px] text-slate-500">{p.code}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.client.name}</td>
                  <td className="px-4 py-3">{levelBadge(policy?.autonomyLevel)}</td>
                  <td className="px-4 py-3">{modeBadge(policy?.executionMode)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-600">
                      {policy && policy.allowedCommands.length > 0
                        ? policy.allowedCommands.length
                        : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                    {p._count.remediations}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/configuracion/planta/${p.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Configurar <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {plants.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No hay plantas. Ejecuta <code>make plants-sync</code>.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-5 text-sm text-slate-700">
        <div className="mb-2 font-semibold text-sky-800">Cómo funciona este panel</div>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Manual:</b> SunHub solo sugiere. Ningún comando se auto-propone cuando nace una alarma.
          </li>
          <li>
            <b>Con aprobación:</b> SunHub crea una remediación <i>proposed</i>. Un ops/admin debe aprobarla
            antes de ejecutar.
          </li>
          <li>
            <b>Automático:</b> SunHub crea la remediación y la aprueba sola. El executor corre según el modo
            elegido (mock o real).
          </li>
          <li>
            <b>Mock vs real:</b> en mock se simula el envío (nada sale al middleware). En real se POSTea al
            endpoint del proveedor — el middleware del hackathon suele responder 4xx en writes, queda registrado
            en el audit log.
          </li>
        </ul>
      </div>
    </AppShell>
  );
}
