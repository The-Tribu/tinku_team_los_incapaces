import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/sunhub/app-shell";
import { getSessionUser, canAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreatePolicy, toPolicyView } from "@/lib/policies";
import { COMMANDS } from "@/lib/commands";
import { PolicyEditor } from "./policy-editor";

export const dynamic = "force-dynamic";

export default async function PolicyEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAdmin(user)) redirect("/dashboard");

  const { id } = await params;
  const plant = await prisma.plant.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, client: { select: { name: true } } },
  });
  if (!plant) notFound();

  const row = await getOrCreatePolicy(id);
  const policy = toPolicyView(row);
  const commands = Object.values(COMMANDS).map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    risk: c.risk,
  }));

  return (
    <AppShell
      title={`Política · ${plant.name}`}
      subtitle={`${plant.code} · ${plant.client.name} — controla qué puede hacer SunHub ante alarmas`}
      actions={
        <Link
          href="/configuracion"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3 w-3" /> Volver
        </Link>
      }
    >
      <PolicyEditor plantId={plant.id} initial={policy} commands={commands} />
    </AppShell>
  );
}
