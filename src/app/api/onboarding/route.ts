import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientName?: string;
    contactEmail?: string;
    plantName?: string;
    plantCode?: string;
    region?: string;
    lat?: number;
    lng?: number;
    capacityKwp?: number;
    contractType?: string;
    providerSlug?: string;
    deviceExternalId?: string;
  };

  const required = ["clientName", "plantName", "plantCode", "capacityKwp", "providerSlug", "deviceExternalId"] as const;
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ error: `${k} required` }, { status: 400 });
  }

  const provider = await prisma.provider.findUnique({ where: { slug: body.providerSlug! } });
  if (!provider) return NextResponse.json({ error: "provider not found" }, { status: 404 });

  const existing = await prisma.client.findFirst({ where: { name: body.clientName! } });
  const client =
    existing ??
    (await prisma.client.create({
      data: {
        name: body.clientName!,
        contactEmail: body.contactEmail ?? null,
        region: body.region ?? null,
      },
    }));

  const plant = await prisma.plant.create({
    data: {
      clientId: client.id,
      code: body.plantCode!,
      name: body.plantName!,
      location: body.region ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      capacityKwp: body.capacityKwp ?? null,
      contractType: body.contractType ?? null,
    },
  });

  const device = await prisma.device.create({
    data: {
      plantId: plant.id,
      providerId: provider.id,
      externalId: body.deviceExternalId!,
      kind: "inverter",
      currentStatus: "offline",
    },
  });

  return NextResponse.json({
    ok: true,
    client: { id: client.id, name: client.name },
    plant: { id: plant.id, code: plant.code, name: plant.name },
    device: { id: device.id, externalId: device.externalId, provider: provider.slug },
    next: {
      message: "Planta creada. El worker de ingesta empezará a poll automáticamente en el próximo ciclo.",
      checkUrl: `/plantas/${plant.id}`,
    },
  });
}
