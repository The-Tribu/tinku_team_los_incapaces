/**
 * In-process pub/sub de alarmas.
 *
 * Uso:
 *   - El worker de alarmas llama a `publishAlarm(event)` cuando persiste una
 *     nueva alarma (o cambia su estado).
 *   - El handler de SSE (`/api/alarms/stream`) llama a `subscribe()` para
 *     recibir cada evento y reenviarlo al navegador.
 *
 * Nota: este bus vive en memoria del proceso que ejecuta Next.js. Si el
 * worker corre en otro proceso (p.ej. `npm run cron` aparte), los eventos
 * no cruzan procesos — el UI recibe la alarma igual al hacer refresh/poll,
 * pero pierde la inmediatez. Para el alcance del hackathon asumimos el
 * flujo `make up` (dev server + cron en el mismo Node runtime).
 */
export type AlarmEvent = {
  id: string;
  deviceId: string;
  plantId: string;
  plantName: string;
  plantCode: string;
  provider: string;
  severity: "critical" | "warning" | "info";
  type: string;
  source: string;
  message: string;
  startedAt: string; // ISO
  /** Diferencia con resoluciones: `new` cuando se crea, `resolved` cuando se cierra. */
  kind: "new" | "resolved" | "ack";
};

type Listener = (event: AlarmEvent) => void;

const g = globalThis as unknown as { __sunhubAlarmBus?: Set<Listener> };
if (!g.__sunhubAlarmBus) g.__sunhubAlarmBus = new Set<Listener>();
const listeners = g.__sunhubAlarmBus;

export function publishAlarm(event: AlarmEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      // un suscriptor caído no tira a los demás
    }
  }
}

export function subscribeAlarms(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function listenerCount(): number {
  return listeners.size;
}
