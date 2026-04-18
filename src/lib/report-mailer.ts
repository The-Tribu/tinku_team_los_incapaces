/**
 * Envío por correo del reporte mensual.
 *
 * El reporte no se guarda en DB como PDF — el botón "Enviar por correo"
 * recomputa las métricas + narrativa MiniMax y manda un HTML formateado.
 * Destinatario por defecto: `client.contactEmail` (la planta pertenece al
 * cliente). Se puede sobrescribir pasando `to` explícito.
 */
import { prisma } from "./prisma";
import { getTransporter, smtpFrom } from "./notifications";
import { computeReportMetrics, generateNarrative, type ReportMetrics } from "./reports";
import { stripMarkdown } from "./strip-markdown";
import { displayClientLabel } from "./display";

export type SendReportResult =
  | { ok: true; to: string; messageId: string }
  | { ok: false; error: string };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function formatCop(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function renderReportHtml(params: {
  plantName: string;
  plantCode: string;
  clientLabel: string;
  periodLabel: string;
  metrics: ReportMetrics;
  narrative: string;
  appUrl: string;
}): string {
  const { plantName, plantCode, clientLabel, periodLabel, metrics, narrative, appUrl } = params;
  const compColor = metrics.compliancePct >= 95 ? "#16a34a" : "#dc2626";
  const narrativeHtml = escapeHtml(narrative).replace(/\n/g, "<br/>");

  const rows: Array<{ label: string; value: string; target?: string }> = [
    {
      label: "Energía",
      value: `${metrics.energyKwh.toFixed(0)} kWh`,
      target: `meta ${metrics.targetEnergyKwh.toFixed(0)} kWh`,
    },
    {
      label: "Uptime",
      value: `${metrics.uptimePct.toFixed(1)}%`,
      target: `meta ${metrics.targetUptimePct.toFixed(0)}%`,
    },
    {
      label: "PR",
      value: `${metrics.prPct.toFixed(1)}%`,
      target: `meta ${metrics.targetPrPct.toFixed(0)}%`,
    },
    { label: "CO₂ evitado", value: `${metrics.co2Ton.toFixed(2)} ton` },
    {
      label: "Ahorro",
      value: formatCop(metrics.savingsCop),
      target: `meta ${formatCop(metrics.targetSavingsCop)}`,
    },
    { label: "Cumplimiento", value: `${metrics.compliancePct.toFixed(1)}%` },
  ];

  const metricsHtml = rows
    .map(
      (r) => `
      <td style="padding:12px;background:#f8fafc;border-radius:8px;vertical-align:top;width:33%">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">${escapeHtml(r.label)}</div>
        <div style="font-size:16px;font-weight:700;color:${r.label === "Cumplimiento" ? compColor : "#0f172a"};margin-top:2px">${escapeHtml(r.value)}</div>
        ${r.target ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${escapeHtml(r.target)}</div>` : ""}
      </td>`,
    )
    .join("");

  const penaltyHtml =
    metrics.penaltyExposureCop > 0
      ? `<div style="margin:16px 0;padding:12px;background:#fef2f2;border-left:4px solid #dc2626;color:#991b1b;font-size:13px">
           Exposición a penalización: ${formatCop(metrics.penaltyExposureCop)} COP
         </div>`
      : "";

  return `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="background:linear-gradient(135deg,#006b2c,#00873a);color:#fff;padding:24px;border-radius:16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.85">Reporte mensual · SunHub</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${escapeHtml(plantName)}</div>
      <div style="font-size:13px;opacity:.9;margin-top:2px">${escapeHtml(clientLabel)} · ${escapeHtml(plantCode)} · ${escapeHtml(periodLabel)}</div>
    </div>

    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-top:16px">
      <tr>${metricsHtml.slice(0, metricsHtml.length / 2)}</tr>
      <tr>${metricsHtml.slice(metricsHtml.length / 2)}</tr>
    </table>

    ${penaltyHtml}

    <div style="margin-top:16px;padding:16px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6d28d9;font-weight:600;margin-bottom:6px">
        Resumen ejecutivo · MiniMax
      </div>
      <div style="font-size:14px;line-height:1.55;color:#1e293b">${narrativeHtml}</div>
    </div>

    <a href="${appUrl}/reportes"
       style="display:inline-block;margin-top:20px;background:#0f172a;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600">
      Ver histórico en SunHub
    </a>

    <p style="margin-top:24px;font-size:11px;color:#94a3b8;line-height:1.5">
      SunHub · Correo generado automáticamente a partir de los datos operativos de tu planta.
      Si tienes dudas, contacta a tu ejecutivo de cuenta.
    </p>
  </div>`;
}

export async function sendReportEmail(
  reportId: string,
  explicitTo?: string | null,
): Promise<SendReportResult> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      client: true,
      plant: { include: { client: true } },
    },
  });
  if (!report) return { ok: false, error: "report not found" };

  const plant = report.plant;
  if (!plant) return { ok: false, error: "report has no plant" };
  const clientRecord = plant.client ?? report.client;

  const to =
    (explicitTo?.trim() ||
      clientRecord.contactEmail?.trim() ||
      process.env.REPORTS_FALLBACK_EMAIL?.trim() ||
      "") ?? "";
  if (!to) return { ok: false, error: "no recipient (client.contactEmail vacío)" };

  const transporter = getTransporter();
  if (!transporter) return { ok: false, error: "SMTP no configurado" };

  const metrics = await computeReportMetrics(plant.id, report.period);
  const clientLabel = displayClientLabel(clientRecord, { name: plant.name });
  let narrative = "";
  try {
    narrative = await generateNarrative(plant.name, clientLabel, metrics);
  } catch (err) {
    narrative = stripMarkdown(
      `(Narrativa IA no disponible: ${(err as Error).message}). ` +
        `En ${metrics.periodLabel} la planta generó ${metrics.energyKwh.toFixed(0)} kWh ` +
        `con ${metrics.uptimePct.toFixed(1)}% de uptime y cumplimiento de ${metrics.compliancePct.toFixed(1)}%.`,
    );
  }

  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const html = renderReportHtml({
    plantName: plant.name,
    plantCode: plant.code,
    clientLabel,
    periodLabel: metrics.periodLabel,
    metrics,
    narrative,
    appUrl,
  });

  const subject = `SunHub · Reporte ${metrics.periodLabel} · ${plant.name}`;

  try {
    const info = await transporter.sendMail({
      from: smtpFrom(),
      to,
      subject,
      html,
      text: `${subject}\n\n${narrative}\n\n${appUrl}/reportes`,
    });

    await prisma.report.update({
      where: { id: report.id },
      data: { status: "sent" },
    });

    return { ok: true, to, messageId: String(info.messageId ?? "") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
