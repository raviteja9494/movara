CREATE TABLE "VehicleRecord" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "amount" DOUBLE PRECISION,
    "odometer" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "provider" TEXT,
    "referenceNumber" TEXT,
    "reminderMode" TEXT NOT NULL DEFAULT 'none',
    "reminderDaysBefore" INTEGER,
    "recurringIntervalDays" INTEGER,
    "recurringIntervalKm" INTEGER,
    "attachmentPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VehicleRecord"
ADD CONSTRAINT "VehicleRecord_vehicleId_fkey"
FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "VehicleRecord_vehicleId_idx" ON "VehicleRecord"("vehicleId");
CREATE INDEX "VehicleRecord_type_idx" ON "VehicleRecord"("type");
CREATE INDEX "VehicleRecord_date_idx" ON "VehicleRecord"("date");
CREATE INDEX "VehicleRecord_validUntil_idx" ON "VehicleRecord"("validUntil");

INSERT INTO "VehicleRecord" (
    "id",
    "vehicleId",
    "type",
    "subtype",
    "title",
    "notes",
    "amount",
    "odometer",
    "date",
    "attachmentPath",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "vehicleId",
    'maintenance',
    "type",
    CASE "type"
        WHEN 'service' THEN 'Service'
        WHEN 'repair' THEN 'Repair'
        WHEN 'inspection' THEN 'Inspection'
        ELSE 'Maintenance record'
    END,
    "notes",
    "cost",
    "odometer",
    "date",
    "receiptPath",
    "createdAt",
    "createdAt"
FROM "MaintenanceRecord";

INSERT INTO "VehicleRecord" (
    "id",
    "vehicleId",
    "type",
    "subtype",
    "title",
    "amount",
    "date",
    "validFrom",
    "validUntil",
    "provider",
    "referenceNumber",
    "reminderMode",
    "reminderDaysBefore",
    "createdAt",
    "updatedAt"
)
SELECT
    (
        substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 12)
    )::uuid,
    "id",
    'document',
    'insurance_third_party',
    'Third-party insurance',
    NULL,
    COALESCE("thirdPartyInsuranceStart", "thirdPartyInsuranceEnd", "createdAt"),
    "thirdPartyInsuranceStart",
    "thirdPartyInsuranceEnd",
    "thirdPartyInsuranceProvider",
    "thirdPartyInsuranceNumber",
    CASE WHEN "thirdPartyInsuranceEnd" IS NOT NULL THEN 'on_date' ELSE 'none' END,
    CASE WHEN "thirdPartyInsuranceEnd" IS NOT NULL THEN 30 ELSE NULL END,
    "createdAt",
    "createdAt"
FROM "Vehicle"
WHERE
    "thirdPartyInsuranceStart" IS NOT NULL OR
    "thirdPartyInsuranceEnd" IS NOT NULL OR
    "thirdPartyInsuranceProvider" IS NOT NULL OR
    "thirdPartyInsuranceNumber" IS NOT NULL;

INSERT INTO "VehicleRecord" (
    "id",
    "vehicleId",
    "type",
    "subtype",
    "title",
    "amount",
    "date",
    "validFrom",
    "validUntil",
    "provider",
    "referenceNumber",
    "reminderMode",
    "reminderDaysBefore",
    "createdAt",
    "updatedAt"
)
SELECT
    (
        substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
        substr(md5(random()::text || clock_timestamp()::text), 1, 12)
    )::uuid,
    "id",
    'document',
    'insurance_own_damage',
    'Own damage insurance',
    NULL,
    COALESCE("ownInsuranceStart", "ownInsuranceEnd", "createdAt"),
    "ownInsuranceStart",
    "ownInsuranceEnd",
    "ownInsuranceProvider",
    "ownInsuranceNumber",
    CASE WHEN "ownInsuranceEnd" IS NOT NULL THEN 'on_date' ELSE 'none' END,
    CASE WHEN "ownInsuranceEnd" IS NOT NULL THEN 30 ELSE NULL END,
    "createdAt",
    "createdAt"
FROM "Vehicle"
WHERE
    "ownInsuranceStart" IS NOT NULL OR
    "ownInsuranceEnd" IS NOT NULL OR
    "ownInsuranceProvider" IS NOT NULL OR
    "ownInsuranceNumber" IS NOT NULL;

ALTER TABLE "Vehicle" DROP COLUMN "thirdPartyInsuranceStart";
ALTER TABLE "Vehicle" DROP COLUMN "thirdPartyInsuranceEnd";
ALTER TABLE "Vehicle" DROP COLUMN "thirdPartyInsuranceProvider";
ALTER TABLE "Vehicle" DROP COLUMN "thirdPartyInsuranceNumber";
ALTER TABLE "Vehicle" DROP COLUMN "ownInsuranceStart";
ALTER TABLE "Vehicle" DROP COLUMN "ownInsuranceEnd";
ALTER TABLE "Vehicle" DROP COLUMN "ownInsuranceProvider";
ALTER TABLE "Vehicle" DROP COLUMN "ownInsuranceNumber";

DROP TABLE "MaintenanceRecord";

ALTER TABLE "VehicleRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;
