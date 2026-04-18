import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SEVERITIES = new Set(["critical", "warning", "info"]);

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pref = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    preferences: pref ?? {
      userId: user.id,
      emailEnabled: true,
      browserEnabled: true,
      soundEnabled: true,
      minSeverity: "warning",
      cooldownMinutes: 10,
    },
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.emailEnabled === "boolean") data.emailEnabled = body.emailEnabled;
  if (typeof body.browserEnabled === "boolean") data.browserEnabled = body.browserEnabled;
  if (typeof body.soundEnabled === "boolean") data.soundEnabled = body.soundEnabled;
  if (typeof body.minSeverity === "string" && SEVERITIES.has(body.minSeverity)) {
    data.minSeverity = body.minSeverity;
  }
  if (typeof body.cooldownMinutes === "number" && body.cooldownMinutes >= 0 && body.cooldownMinutes <= 1440) {
    data.cooldownMinutes = Math.round(body.cooldownMinutes);
  }

  const saved = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: data,
    create: {
      userId: user.id,
      emailEnabled: (data.emailEnabled as boolean | undefined) ?? true,
      browserEnabled: (data.browserEnabled as boolean | undefined) ?? true,
      soundEnabled: (data.soundEnabled as boolean | undefined) ?? true,
      minSeverity: (data.minSeverity as string | undefined) ?? "warning",
      cooldownMinutes: (data.cooldownMinutes as number | undefined) ?? 10,
    },
  });

  return NextResponse.json({ preferences: saved });
}
