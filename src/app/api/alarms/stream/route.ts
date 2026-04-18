import { NextRequest } from "next/server";
import { subscribeAlarms, type AlarmEvent } from "@/lib/alarm-bus";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream para alarmas en tiempo real.
 * El cliente se suscribe con `new EventSource('/api/alarms/stream')`.
 *
 * Formato de cada evento:
 *   event: alarm
 *   data: { "kind": "new|resolved|ack", "id": ..., "severity": ..., ... }
 *
 * Mantiene un keepalive cada 25s para que Vercel/Caddy no corte la conexión.
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

      const unsub = subscribeAlarms((event: AlarmEvent) => {
        write(`event: alarm\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const keepalive = setInterval(() => write(`: ping ${Date.now()}\n\n`), 25_000);

      const cleanup = () => {
        clearInterval(keepalive);
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
