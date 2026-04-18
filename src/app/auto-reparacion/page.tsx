import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { RemediationConsole, type RemediationRow, type PolicyRow } from "./remediation-console";

export const dynamic = "force-dynamic";

export default async function AutoReparacionPage() {
  const [actionsRaw, policies, successLast24h] = await Promise.all([
    prisma.remediationAction.findMany({
      take: 200,
      orderBy: { executedAt: "desc" },
      include: {
        device: {
          select: {
            id: true,
            externalId: true,
            plant: { select: { id: true, name: true, code: true } },
            provider: { select: { slug: true, displayName: true } },
          },
        },
        alarm: {
          select: { id: true, type: true, severity: true, message: true, resolvedAt: true },
        },
      },
    }),
    prisma.remediationPolicy.findMany({ orderBy: [{ alarmType: "asc" }, { providerSlug: "asc" }] }),
    prisma.remediationAction.count({
      where: {
        status: "success",
        executedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
      },
    }),
  ]);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const resolvedLast24h = await prisma.remediationAction.count({
    where: { outcome: "resolved", verifiedAt: { gte: dayAgo } },
  });

  const rows: RemediationRow[] = actionsRaw.map((r) => ({
    id: r.id,
    alarmId: r.alarmId,
    deviceId: r.deviceId,
    actionType: r.actionType,
    severity: r.severity,
    reason: r.reason,
    status: r.status,
    executionMode: r.executionMode,
    attempt: r.attempt,
    triggeredBy: r.triggeredBy,
    outcome: r.outcome,
    executedAt: r.executedAt.toISOString(),
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    errorMessage: r.errorMessage,
    requestPayload: r.requestPayload as unknown,
    responseBody: r.responseBody as unknown,
    device: r.device,
    alarm: r.alarm
      ? {
          id: r.alarm.id,
          type: r.alarm.type,
          severity: r.alarm.severity,
          message: r.alarm.message,
          resolvedAt: r.alarm.resolvedAt?.toISOString() ?? null,
        }
      : null,
  }));
  const mode = (process.env.REMEDIATION_MODE ?? "dry_run").toLowerCase();
  const aiEnabled = process.env.REMEDIATION_AI_AGENT === "1";

  const policyRows: PolicyRow[] = policies.map((p) => ({
    id: p.id,
    alarmType: p.alarmType,
    providerSlug: p.providerSlug,
    actionType: p.actionType,
    maxSeverity: p.maxSeverity,
    cooldownMin: p.cooldownMin,
    maxAttempts: p.maxAttempts,
    enabled: p.enabled,
    requiresHuman: p.requiresHuman,
    requiresAiDecision: p.requiresAiDecision,
  }));

  return (
    <AppShell
      title="Auto-reparación"
      subtitle={`${successLast24h} acciones en 24h · ${resolvedLast24h} resueltas · modo ${mode}${aiEnabled ? " · IA on" : ""}`}
    >
      <RemediationConsole
        rows={rows}
        policies={policyRows}
        mode={mode}
        aiEnabled={aiEnabled}
      />
    </AppShell>
  );
}
