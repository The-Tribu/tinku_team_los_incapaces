-- AlterTable
ALTER TABLE "alarms" ADD COLUMN     "requires_human" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "plants" ADD COLUMN     "auto_remediation_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "remediation_actions" (
    "id" UUID NOT NULL,
    "alarm_id" UUID,
    "device_id" UUID NOT NULL,
    "action_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "execution_mode" TEXT NOT NULL,
    "request_payload" JSONB,
    "response_body" JSONB,
    "error_message" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "triggered_by" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "remediation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remediation_policies" (
    "id" UUID NOT NULL,
    "alarm_type" TEXT NOT NULL,
    "provider_slug" TEXT,
    "action_type" TEXT NOT NULL,
    "max_severity" TEXT NOT NULL,
    "cooldown_min" INTEGER NOT NULL DEFAULT 30,
    "max_attempts" INTEGER NOT NULL DEFAULT 2,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "requires_human" BOOLEAN NOT NULL DEFAULT false,
    "requires_ai_decision" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remediation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remediation_actions_device_id_executed_at_idx" ON "remediation_actions"("device_id", "executed_at" DESC);

-- CreateIndex
CREATE INDEX "remediation_actions_alarm_id_idx" ON "remediation_actions"("alarm_id");

-- CreateIndex
CREATE INDEX "remediation_actions_status_idx" ON "remediation_actions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "remediation_policies_alarm_type_provider_slug_action_type_key" ON "remediation_policies"("alarm_type", "provider_slug", "action_type");

-- AddForeignKey
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_alarm_id_fkey" FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
