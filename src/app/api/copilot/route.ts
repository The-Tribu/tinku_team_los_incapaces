import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/minimax";
import { displayClientLabel } from "@/lib/display";
import { getFleetSummary, getTopPlants } from "@/lib/fleet";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fleetContext(): Promise<string> {
  const [summary, topPlants, openAlarms] = await Promise.all([
    getFleetSummary(),
    getTopPlants(8),
    prisma.alarm.findMany({
      where: { resolvedAt: null },
      take: 10,
      orderBy: [{ severity: "asc" }, { startedAt: "desc" }],
      include: {
        device: {
          select: { plant: { select: { name: true, code: true, client: { select: { name: true } } } } },
        },
      },
    }),
  ]);
  return [
    "== Estado actual de la flota (SunHub) ==",
    `Plantas totales: ${summary.totalPlants}`,
    `Online: ${summary.onlinePct}%  ·  En riesgo: ${summary.at_risk}  ·  Alarmas abiertas: ${summary.activeAlarms}`,
    `Generación ahora: ${summary.currentPowerMw.toFixed(2)} MW  ·  Energía hoy: ${summary.todayEnergyMwh.toFixed(1)} MWh  ·  Capacidad: ${summary.capacityMw.toFixed(2)} MW`,
    "",
    "Top plantas:",
    ...topPlants.map(
      (p) =>
        `- ${p.code} ${p.name} (${p.client}) · ${p.capacityKwp}kWp · PR ${p.pr.toFixed(1)}% · estado ${p.status}`,
    ),
    "",
    "Alarmas abiertas:",
    ...openAlarms.map(
      (a) =>
        `- [${a.severity}] ${a.message} @ ${a.device.plant.name} (${a.device.plant.code}, ${displayClientLabel(a.device.plant.client, a.device.plant)})`,
    ),
  ].join("\n");
}

const SYSTEM = `Eres SunHub Copilot, un operador solar experto para Techos Rentables.
Respondes siempre en español, concreto y accionable. Usas el contexto de la flota que te pasamos cada mensaje como fuente de verdad.
Cuando un usuario pregunte por una planta específica, cita código y cliente.
Prefieres respuestas en viñetas cortas. Si recomiendas una acción, inclúyela como "Próxima acción: …".`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages = (body.messages as ChatMessage[] | undefined) ?? [];
  if (messages.length === 0) return NextResponse.json({ error: "messages required" }, { status: 400 });

  const context = await fleetContext();

  // MiniMax-Text-01 expects a single system message; concat the context.
  const augmented: ChatMessage[] = [
    { role: "system", content: `${SYSTEM}\n\n${context}` },
    ...messages,
  ];

  try {
    const answer = await chat(augmented, { temperature: 0.3 });
    return NextResponse.json({ answer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
