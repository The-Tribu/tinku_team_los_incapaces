import { redirect } from "next/navigation";
import { AppShell } from "@/components/sunhub/app-shell";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UsersConsole } from "./users-console";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  return (
    <AppShell
      title="Usuarios y roles"
      subtitle="Administra el acceso de tu equipo a SunHub"
    >
      <UsersConsole
        currentUserId={me.id}
        initialUsers={users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    </AppShell>
  );
}
