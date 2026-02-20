-- Add new columns
ALTER TABLE "Vehicle" ADD COLUMN "thirdPartyInsuranceProvider" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "thirdPartyInsuranceNumber" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "ownInsuranceProvider" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "ownInsuranceNumber" TEXT;

-- Migrate existing data to third-party fields
UPDATE "Vehicle" SET "thirdPartyInsuranceProvider" = "insuranceProvider", "thirdPartyInsuranceNumber" = "insuranceNumber" WHERE "insuranceProvider" IS NOT NULL OR "insuranceNumber" IS NOT NULL;

-- Drop old columns
ALTER TABLE "Vehicle" DROP COLUMN "insuranceProvider";
ALTER TABLE "Vehicle" DROP COLUMN "insuranceNumber";
