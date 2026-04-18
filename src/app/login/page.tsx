import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  const { next } = await searchParams;
  if (user) redirect(next && next.startsWith("/") ? next : "/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-violet-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="font-heading text-3xl font-bold text-sunhub-primary">SunHub</span>
            <span className="text-xl">⚡</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Plataforma unificada de operación solar</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="font-heading text-xl font-semibold text-slate-900">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-slate-500">
            Accede con tu cuenta corporativa de Techos Rentables.
          </p>
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          ¿Primera vez? Pídele a un admin que te cree la cuenta.
        </p>
      </div>
    </main>
  );
}
