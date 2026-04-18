import { NextRequest } from "next/server";
import { subscribeAlarms, type AlarmEvent } from "@/lib/alarm-bus";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_POLL_MS = 8_000;
const KEEPALIVE_MS = 25_000;
// Ventana de look-back para el primer poll. Cubre el caso "abrí la pestaña y
// hace 20s entró una alarma del cron en otro proceso".
const INITIAL_LOOKBACK_MS = 60_000;

type Severity = "critical" | "warning" | "info";

function castSeverity(v: string | null | undefined): Severity {
  if (v === "critical" || v === "warning" || v === "info") return v;
  return "info";
}

/**
 * Server-Sent Events stream para alarmas en tiempo real.
 *
 * Dos fuentes de eventos:
 *   1. Bus in-process (`subscribeAlarms`) — inmediato, pero sólo recibe
 *      publicaciones del mismo proceso Node. Si el cron corre aparte
 *      (`make up` usa dos shells), este bus no cruza procesos.
 *   2. Poll a Postgres cada 8s — cubre el caso cross-process leyendo
 *      alarmas recién insertadas. Deduplica contra los IDs ya emitidos.
 *
 * El cliente se suscribe con `new EventSource('/api/alarms/stream')`.
 * Keepalive cada 25s para que Caddy/Vercel no corte la conexión.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // cliente cerró
        }
      };

      write(`: connected ${new Date().toISOString()}\n\n`);
      write(`event: hello\ndata: {"userId":"${user.id}"}\n\n`);

      const seenIds = new Set<string>();
      // Tope de IDs recordados para no crecer indefinidamente. 5k ≈ 40 KB.
      const MAX_SEEN = 5_000;

      const emit = (event: AlarmEvent) => {
        if (seenIds.has(event.id)) return;
        seenIds.add(event.id);
        if (seenIds.size > MAX_SEEN) {
          // LRU barato — vaciar la mitad más antigua.
          const keep = Array.from(seenIds).slice(MAX_SEEN / 2);
          seenIds.clear();
          keep.forEach((k) => seenIds.add(k));
        }
        write(`event: alarm\ndata: ${JSON.stringify(event)}\n\n`);
      };

      // 1. Bus in-process (mismo proceso Node). Inmediato.
      const unsub = subscribeAlarms(emit);

      // 2. Poll a Postgres para capturar alarmas de otros procesos (cron).
      let lastPollTs = new Date(Date.now() - INITIAL_LOOKBACK_MS);
      let polling = false;
      const dbPoll = async () => {
        if (polling) return;
        polling = true;
        try {
          const rows = await prisma.alarm.findMany({
            where: { startedAt: { gte: lastPollTs } },
            orderBy: { startedAt: "asc" },
            take: 50,
            include: {
              device: {
                include: {
                  plant: { select: { id: true, name: true, code: true } },
                  provider: { select: { slug: true } },
                },
              },
            },
          });
          for (const a of rows) {
            emit({
              id: a.id,
              deviceId: a.deviceId,
              plantId: a.device.plant.id,
              plantName: a.device.plant.name,
              plantCode: a.device.plant.code,
              provider: a.device.provider.slug,
              severity: castSeverity(a.severity),
              type: a.type,
              source: a.source,
              message: a.message,
              startedAt: a.startedAt.toISOString(),
              kind: a.resolvedAt ? "resolved" : "new",
            });
          }
          if (rows.length > 0) {
            lastPollTs = rows[rows.length - 1].startedAt;
          }
        } catch (err) {
          console.warn(`[sse] db poll failed: ${(err as Error).message}`);
        } finally {
          polling = false;
        }
      };
      const pollTimer = setInterval(() => void dbPoll(), DB_POLL_MS);
      // Disparo inicial para cerrar la ventana de look-back ASAP.
      void dbPoll();

      const keepalive = setInterval(() => write(`: ping ${Date.now()}\n\n`), KEEPALIVE_MS);

      const cleanup = () => {
        clearInterval(keepalive);
        clearInterval(pollTimer);
        unsub();
        try { controller.close(); } catch {}
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
