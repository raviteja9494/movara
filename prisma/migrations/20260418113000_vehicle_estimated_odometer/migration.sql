ALTER TABLE "Vehicle"
ADD COLUMN "estimatedOdometerKm" DOUBLE PRECISION,
ADD COLUMN "estimatedOdometerBaseKm" INTEGER,
ADD COLUMN "estimatedOdometerBaseAt" TIMESTAMP(3),
ADD COLUMN "estimatedOdometerUpdatedAt" TIMESTAMP(3);
