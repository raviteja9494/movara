-- CreateTable
CREATE TABLE "TripMerge" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "gapAfter" TIMESTAMP(3) NOT NULL,
    "gapBefore" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripMerge_deviceId_idx" ON "TripMerge"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "TripMerge_deviceId_gapAfter_gapBefore_key" ON "TripMerge"("deviceId", "gapAfter", "gapBefore");

-- AddForeignKey
ALTER TABLE "TripMerge" ADD CONSTRAINT "TripMerge_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
