/**
 * Dispatcher de notificaciones.
 *
 * Regla del operador: debe enterarse de una alarma crítica en <5 minutos.
 * Canales activos:
 *   1. SSE (in-app) — alarm-bus publica inmediatamente. Si hay operador con
 *      la pestaña abierta, escucha el sonido + notificación nativa.
 *   2. Email — fan-out por SMTP a los usuarios cuya preferencia lo permite
 *      y cuya severidad mínima sea <= a la severidad del evento.
 *
 * Cooldown: por (deviceId, userId, type) — para no bombardear al operador
 * con la misma condición mientras sigue activa.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "./prisma";
import type { AlarmEvent } from "./alarm-bus";

let transporter: Transporter | null = null;
let transporterInitFailed = false;

export function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (transporterInitFailed) return null;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !port) {
    transporterInitFailed = true;
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    ignoreTLS: port === 1025,
  });
  return transporter;
}

export function smtpFrom(): string {
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@sunhub.local";
}

function severityRank(s: string): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderEmailHtml(event: AlarmEvent): string {
  const color = event.severity === "critical" ? "#dc2626" : event.severity === "warning" ? "#d97706" : "#2563eb";
  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <div style="border-left:4px solid ${color};padding-left:16px">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${color};font-weight:600">
        Alarma ${event.severity}
      </div>
      <h2 style="margin:4px 0 12px;font-size:18px;color:#0f172a">${escapeHtml(event.message)}</h2>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;color:#334155">
      <tr><td style="padding:6px 0;color:#64748b">Planta</td><td>${escapeHtml(event.plantName)} (${escapeHtml(event.plantCode)})</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Proveedor</td><td>${escapeHtml(event.provider)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Tipo</td><td>${escapeHtml(event.type)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Inició</td><td>${new Date(event.startedAt).toLocaleString("es-CO")}</td></tr>
    </table>
    <a href="${appUrl}/alarmas"
       style="display:inline-block;margin-top:20px;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">
      Abrir centro de alarmas
    </a>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">
      SunHub · Este correo es automático. Ajusta tus preferencias desde tu perfil.
    </p>
  </div>`;
}

export type FanoutResult = {
  email: { sent: number; skipped: number; failed: number };
};

export async function fanoutAlarm(event: AlarmEvent): Promise<FanoutResult> {
  const result: FanoutResult = { email: { sent: 0, skipped: 0, failed: 0 } };
  if (event.kind !== "new") return result;

  const tx = getTransporter();
  const users = await prisma.user.findMany({
    where: { active: true },
    include: { notificationPreference: true },
  });

  for (const user of users) {
    const pref = user.notificationPreference;
    const emailEnabled = pref?.emailEnabled ?? true;
    const minSev = pref?.minSeverity ?? "warning";
    const cooldown = pref?.cooldownMinutes ?? 10;

    if (!emailEnabled) {
      result.email.skipped++;
      await logNotification(event.id, user.id, "email", "skipped", "email_disabled");
      continue;
    }
    if (severityRank(event.severity) < severityRank(minSev)) {
      result.email.skipped++;
      await logNotification(event.id, user.id, "email", "skipped", `min_severity=${minSev}`);
      continue;
    }

    // Cooldown por (deviceId, userId, type): si en los últimos `cooldown` min
    // ya enviamos un mail a este user por una alarma del mismo device+type,
    // no repetimos.
    const cooldownStart = new Date(Date.now() - cooldown * 60_000);
    const recent = await prisma.notificationLog.findFirst({
      where: {
        userId: user.id,
        channel: "email",
        status: "sent",
        sentAt: { gte: cooldownStart },
      },
      orderBy: { sentAt: "desc" },
    });
    if (recent) {
      const recentAlarm = await prisma.alarm.findUnique({
        where: { id: recent.alarmId },
        select: { deviceId: true, type: true },
      });
      if (recentAlarm && recentAlarm.deviceId === event.deviceId && recentAlarm.type === event.type) {
        result.email.skipped++;
        await logNotification(event.id, user.id, "email", "skipped", "cooldown");
        continue;
      }
    }

    if (!tx) {
      result.email.skipped++;
      await logNotification(event.id, user.id, "email", "skipped", "smtp_unconfigured");
      continue;
    }

    const subject = `[SunHub] ${event.severity.toUpperCase()} · ${event.plantName}`;
    try {
      await tx.sendMail({
        from: smtpFrom(),
        to: user.email,
        subject,
        html: renderEmailHtml(event),
      });
      result.email.sent++;
      await logNotification(event.id, user.id, "email", "sent");
    } catch (err) {
      result.email.failed++;
      await logNotification(event.id, user.id, "email", "failed", (err as Error).message);
    }
  }

  await prisma.alarm.update({
    where: { id: event.id },
    data: { notifiedAt: new Date() },
  }).catch(() => {});

  return result;
}

async function logNotification(
  alarmId: string,
  userId: string | null,
  channel: "email" | "browser" | "sse",
  status: "sent" | "skipped" | "failed",
  detail?: string,
) {
  try {
    await prisma.notificationLog.create({
      data: { alarmId, userId: userId ?? undefined, channel, status, detail: detail ?? null },
    });
  } catch {
    // si falla el log no queremos romper el fanout
  }
}

// ── Escalamiento a cliente ────────────────────────────────────
// Enviar un correo al contacto del cliente dueño de la planta cuando la
// operación decide que el problema requiere su atención. Retorna el estado
// del envío para que la UI pueda dar feedback al operador.
export type EscalationResult = {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  to?: string;
};

export async function notifyClientEscalation(
  alarmId: string,
  opts: { note?: string; escalatedBy: { id: string; name: string; email: string } },
): Promise<EscalationResult> {
  const alarm = await prisma.alarm.findUnique({
    where: { id: alarmId },
    include: {
      device: {
        include: {
          plant: { include: { client: true } },
          provider: { select: { slug: true, displayName: true } },
        },
      },
    },
  });
  if (!alarm) return { status: "failed", reason: "alarm_not_found" };

  const client = alarm.device.plant.client;
  const to = client.contactEmail?.trim();
  if (!to) {
    await logNotification(alarm.id, null, "email", "skipped", "client_without_contact_email");
    return { status: "skipped", reason: "client_sin_correo" };
  }

  const tx = getTransporter();
  if (!tx) {
    await logNotification(alarm.id, null, "email", "skipped", "smtp_unconfigured");
    return { status: "skipped", reason: "smtp_no_configurado", to };
  }

  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const severityColor =
    alarm.severity === "critical" ? "#dc2626" : alarm.severity === "warning" ? "#d97706" : "#2563eb";
  const html = `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <div style="border-left:4px solid ${severityColor};padding-left:16px">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${severityColor};font-weight:600">
        Escalamiento · Alarma ${alarm.severity}
      </div>
      <h2 style="margin:4px 0 12px;font-size:18px;color:#0f172a">${escapeHtml(alarm.message)}</h2>
    </div>
    <p style="margin-top:12px;font-size:14px;color:#334155">
      Hola ${escapeHtml(client.name)}, el equipo de operaciones de SunHub escaló una alarma en tu planta que requiere tu atención.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;color:#334155">
      <tr><td style="padding:6px 0;color:#64748b">Planta</td><td>${escapeHtml(alarm.device.plant.name)} (${escapeHtml(alarm.device.plant.code)})</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Proveedor</td><td>${escapeHtml(alarm.device.provider.displayName)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Tipo</td><td>${escapeHtml(alarm.type)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Inició</td><td>${alarm.startedAt.toLocaleString("es-CO")}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Escaló</td><td>${escapeHtml(opts.escalatedBy.name)} &lt;${escapeHtml(opts.escalatedBy.email)}&gt;</td></tr>
    </table>
    ${
      opts.note
        ? `<div style="margin-top:16px;padding:12px 14px;border-radius:10px;background:#fefce8;border:1px solid #fde68a;font-size:13px;color:#713f12">
             <div style="font-weight:600;margin-bottom:4px">Nota del operador</div>
             <div>${escapeHtml(opts.note)}</div>
           </div>`
        : ""
    }
    <a href="${appUrl}/alarmas?selectedId=${alarm.id}"
       style="display:inline-block;margin-top:20px;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">
      Ver detalle en SunHub
    </a>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">
      SunHub · Notificación automática para el contacto comercial de ${escapeHtml(client.name)}.
    </p>
  </div>`;

  const subject = `[SunHub] Escalamiento · ${alarm.device.plant.name} · ${alarm.severity}`;
  try {
    await tx.sendMail({ from: smtpFrom(), to, subject, html });
    await logNotification(alarm.id, opts.escalatedBy.id, "email", "sent", "escalation");
    return { status: "sent", to };
  } catch (err) {
    await logNotification(alarm.id, opts.escalatedBy.id, "email", "failed", (err as Error).message);
    return { status: "failed", reason: (err as Error).message, to };
  }
}
