WITH ranked_duplicates AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "deviceId", "timestamp", "latitude", "longitude"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_num
  FROM "Position"
)
DELETE FROM "Position"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_duplicates
  WHERE row_num > 1
);

CREATE UNIQUE INDEX "Position_deviceId_timestamp_latitude_longitude_key"
ON "Position"("deviceId", "timestamp", "latitude", "longitude");
