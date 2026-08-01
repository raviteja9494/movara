ALTER TABLE "Device"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'offline',
ADD COLUMN "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "lastSeen" TIMESTAMP(3),
ADD COLUMN "protocol" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "lastAttributes" JSONB;

ALTER TABLE "Vehicle"
ADD COLUMN "photoData" BYTEA,
ADD COLUMN "photoMimeType" TEXT,
ADD COLUMN "photoFilename" TEXT;

ALTER TABLE "VehicleRecord"
ADD COLUMN "attachmentData" BYTEA,
ADD COLUMN "attachmentMimeType" TEXT,
ADD COLUMN "attachmentFilename" TEXT;

CREATE TABLE "DevicePacketAttribute" (
  "id" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "packetId" TEXT NOT NULL,
  "attributes" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DevicePacketAttribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceCommand" (
  "id" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "protocol" TEXT NOT NULL,
  "commandKey" TEXT NOT NULL,
  "commandLabel" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "transport" TEXT NOT NULL,
  "serverFlag" INTEGER,
  "status" TEXT NOT NULL,
  "payload" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "response" TEXT,
  "error" TEXT,
  CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedLocation" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RawLogEntry" (
  "id" UUID NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "port" INTEGER NOT NULL,
  "raw" TEXT NOT NULL,
  "kind" TEXT,
  "remoteAddress" TEXT,
  CONSTRAINT "RawLogEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuntimeSettings" (
  "id" TEXT NOT NULL DEFAULT 'runtime',
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuntimeSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevicePacketAttribute_deviceId_packetId_key"
ON "DevicePacketAttribute"("deviceId", "packetId");
CREATE INDEX "DevicePacketAttribute_deviceId_updatedAt_idx"
ON "DevicePacketAttribute"("deviceId", "updatedAt");
CREATE INDEX "DeviceCommand_deviceId_createdAt_idx"
ON "DeviceCommand"("deviceId", "createdAt");
CREATE INDEX "DeviceCommand_protocol_status_idx"
ON "DeviceCommand"("protocol", "status");
CREATE INDEX "DeviceCommand_protocol_serverFlag_idx"
ON "DeviceCommand"("protocol", "serverFlag");
CREATE INDEX "SavedLocation_name_idx" ON "SavedLocation"("name");
CREATE INDEX "RawLogEntry_at_idx" ON "RawLogEntry"("at");
CREATE INDEX "RawLogEntry_port_at_idx" ON "RawLogEntry"("port", "at");

ALTER TABLE "DevicePacketAttribute"
ADD CONSTRAINT "DevicePacketAttribute_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceCommand"
ADD CONSTRAINT "DeviceCommand_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
