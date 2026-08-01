-- Fresh-database migration: existing installations must be backed up and recreated.
ALTER TABLE "Device" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "DevicePacketAttribute" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "DeviceCommand" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "TripMerge" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "Position" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "Vehicle" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "Trip" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "TripStop" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "TripPosition" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "FuelRecord" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "VehicleRecord" ADD COLUMN "userId" UUID NOT NULL;
ALTER TABLE "SavedLocation" ADD COLUMN "userId" UUID NOT NULL;

ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DevicePacketAttribute" ADD CONSTRAINT "DevicePacketAttribute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripMerge" ADD CONSTRAINT "TripMerge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripPosition" ADD CONSTRAINT "TripPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleRecord" ADD CONSTRAINT "VehicleRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Device_userId_idx" ON "Device"("userId");
CREATE INDEX "DevicePacketAttribute_userId_idx" ON "DevicePacketAttribute"("userId");
CREATE INDEX "DeviceCommand_userId_idx" ON "DeviceCommand"("userId");
CREATE INDEX "TripMerge_userId_idx" ON "TripMerge"("userId");
CREATE INDEX "Position_userId_idx" ON "Position"("userId");
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");
CREATE INDEX "TripStop_userId_idx" ON "TripStop"("userId");
CREATE INDEX "TripPosition_userId_idx" ON "TripPosition"("userId");
CREATE INDEX "FuelRecord_userId_idx" ON "FuelRecord"("userId");
CREATE INDEX "VehicleRecord_userId_idx" ON "VehicleRecord"("userId");
CREATE INDEX "SavedLocation_userId_idx" ON "SavedLocation"("userId");
