import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const providers = await prisma.provider.findMany({ orderBy: { displayName: "asc" } });
  return (
    <AppShell
      title="Onboarding de planta solar"
      subtitle="5 pasos · menos de 10 min. La planta empieza a reportar en el próximo ciclo de ingesta."
    >
      <OnboardingWizard providers={providers.map((p) => ({ slug: p.slug, displayName: p.displayName }))} />
    </AppShell>
  );
}
