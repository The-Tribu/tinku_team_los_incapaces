import { AppShell } from "@/components/sunhub/app-shell";
import { CopilotChat } from "./copilot-chat";

export const dynamic = "force-dynamic";

export default function CopilotPage() {
  return (
    <AppShell
      title="Copilot AI"
      subtitle="Pregunta en lenguaje natural sobre tu flota solar"
    >
      <div className="mx-auto max-w-3xl">
        <CopilotChat />
      </div>
    </AppShell>
  );
}
