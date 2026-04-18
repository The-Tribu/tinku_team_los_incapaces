-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_email" TEXT,
    "region" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plants" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "lat" DECIMAL(10,6),
    "lng" DECIMAL(10,6),
    "capacity_kwp" DECIMAL(10,2),
    "contract_type" TEXT,
    "contract_end" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "auth_type" TEXT,
    "polling_min" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT,
    "installed_at" DATE,
    "current_status" TEXT NOT NULL DEFAULT 'offline',
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readings" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "power_ac_kw" DECIMAL(10,3),
    "voltage_v" DECIMAL(10,2),
    "current_a" DECIMAL(10,2),
    "frequency_hz" DECIMAL(6,2),
    "power_factor" DECIMAL(4,3),
    "temperature_c" DECIMAL(5,2),
    "energy_kwh" DECIMAL(12,3),
    "raw" JSONB,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "target_energy_kwh" DECIMAL(12,2),
    "target_savings_cop" DECIMAL(14,2),
    "target_uptime_pct" DECIMAL(5,2),
    "target_pr_pct" DECIMAL(5,2),
    "target_co2_ton" DECIMAL(10,3),
    "penalty_per_breach" DECIMAL(14,2),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarms" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "severity" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "assignee" TEXT,
    "ai_suggestion" TEXT,

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "predicted_type" TEXT NOT NULL,
    "probability" DECIMAL(4,3) NOT NULL,
    "days_to_event" DECIMAL(5,2),
    "confidence" DECIMAL(4,3),
    "root_cause" TEXT,
    "suggested_action" TEXT,
    "model_version" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "plant_id" UUID,
    "period" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pdf_url" TEXT,
    "compliance_pct" DECIMAL(5,2),
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plants_code_key" ON "plants"("code");

-- CreateIndex
CREATE INDEX "plants_client_id_idx" ON "plants"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "providers_slug_key" ON "providers"("slug");

-- CreateIndex
CREATE INDEX "devices_plant_id_idx" ON "devices"("plant_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_provider_id_external_id_key" ON "devices"("provider_id", "external_id");

-- CreateIndex
CREATE INDEX "readings_device_id_ts_idx" ON "readings"("device_id", "ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_plant_id_period_month_key" ON "contracts"("plant_id", "period_month");

-- CreateIndex
CREATE INDEX "alarms_device_id_started_at_idx" ON "alarms"("device_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "alarms_resolved_at_idx" ON "alarms"("resolved_at");

-- CreateIndex
CREATE INDEX "predictions_device_id_generated_at_idx" ON "predictions"("device_id", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "reports_client_id_period_idx" ON "reports"("client_id", "period");

-- AddForeignKey
ALTER TABLE "plants" ADD CONSTRAINT "plants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
