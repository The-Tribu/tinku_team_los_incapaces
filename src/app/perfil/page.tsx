import { redirect } from "next/navigation";
import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { PreferencesForm } from "./preferences-form";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const pref = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
  const initial = pref ?? {
    emailEnabled: true,
    browserEnabled: true,
    soundEnabled: true,
    minSeverity: "warning" as const,
    cooldownMinutes: 10,
  };

  return (
    <AppShell title="Mi perfil" subtitle="Notificaciones · contacto">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Cuenta</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Nombre</dt><dd className="mt-0.5 font-medium">{user.name}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="mt-0.5 font-medium">{user.email}</dd></div>
            <div><dt className="text-slate-500">Rol</dt><dd className="mt-0.5 font-medium capitalize">{user.role}</dd></div>
          </dl>
        </section>

        <PreferencesForm
          initial={{
            emailEnabled: initial.emailEnabled,
            browserEnabled: initial.browserEnabled,
            soundEnabled: initial.soundEnabled,
            minSeverity: initial.minSeverity as "critical" | "warning" | "info",
            cooldownMinutes: initial.cooldownMinutes,
          }}
        />
      </div>
    </AppShell>
  );
}
