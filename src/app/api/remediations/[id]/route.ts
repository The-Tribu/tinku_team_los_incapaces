import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdmin, canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approve, cancel, execute, markForRetry, reject, verify } from "@/lib/remediation";
import { getOrCreatePolicy, toPolicyView } from "@/lib/policies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "execute", "verify", "cancel", "retry"]),
  reason: z.string().optional(),
  // override executionMode — si se omite, usa la política. Se guarda para auditoría.
  executionMode: z.enum(["mock", "real"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!canWrite(me)) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const rem = await prisma.remediation.findUnique({ where: { id }, select: { plantId: true } });
  if (!rem) return NextResponse.json({ error: "remediation not found" }, { status: 404 });

  try {
    switch (parsed.data.action) {
      case "approve": {
        const policyRow = await getOrCreatePolicy(rem.plantId);
        const policy = toPolicyView(policyRow);
        // si la política requiere admin, verificamos
        if (policy.requiredApproverRole === "admin" && !canAdmin(me)) {
          return NextResponse.json(
            { error: "Esta planta requiere aprobación de admin" },
            { status: 403 },
          );
        }
        const row = await approve(id, me!.id);
        return NextResponse.json({ remediation: row });
      }
      case "reject": {
        const row = await reject(id, me!.id, parsed.data.reason ?? "sin motivo");
        return NextResponse.json({ remediation: row });
      }
      case "execute": {
        const row = await execute(id, {
          userId: me!.id,
          executionMode: parsed.data.executionMode,
        });
        return NextResponse.json({ remediation: row });
      }
      case "verify": {
        const row = await verify(id);
        return NextResponse.json({ remediation: row });
      }
      case "cancel": {
        const row = await cancel(id, me!.id, parsed.data.reason ?? "cancelado por el operador");
        return NextResponse.json({ remediation: row });
      }
      case "retry": {
        await markForRetry(id);
        const row = await execute(id, { userId: me!.id, isRetry: true });
        return NextResponse.json({ remediation: row });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = await prisma.remediation.findUnique({
    where: { id },
    include: {
      plant: { select: { id: true, name: true, code: true } },
      device: { select: { externalId: true, provider: { select: { slug: true } } } },
      audit: { orderBy: { createdAt: "desc" } },
      alarm: { select: { id: true, type: true, severity: true, message: true, resolvedAt: true } },
      prediction: { select: { id: true, predictedType: true, probability: true, rootCause: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Agent decision asociada (si la hay)
  const agentDecision = await prisma.agentDecision.findFirst({
    where: { remediationId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ remediation: row, agentDecision });
}
