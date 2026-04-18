import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BottomNav } from "./bottom-nav";
import { SwRegister } from "./sw-register";

export const dynamic = "force-dynamic";

export default async function ClienteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Validamos temprano que la planta exista para todas las subpáginas.
  const plant = await prisma.plant.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!plant) notFound();

  return (
    <div className="min-h-screen bg-m3-surface font-sans text-m3-on-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col pb-28">
        {children}
      </div>
      <BottomNav plantId={id} />
      <SwRegister />
    </div>
  );
}
