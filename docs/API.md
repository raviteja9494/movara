# API reference

All endpoints return JSON. Base path: `/api/v1`. Pagination uses `page` (1-based) and `limit` (max 100); defaults page=1, limit=10. See [DEVELOPMENT.md](DEVELOPMENT.md) for error envelope and pagination format.

## Health

**GET /health**

Returns `{ "status": "ok" }`. No auth.

---

## Devices

**GET /api/v1/devices**

List devices. Query: `page`, `limit`. Response: `{ data: [...], pagination: { total, page, limit, pages, hasNextPage, hasPreviousPage } }`. Each item: `id`, `imei`, `name`, `createdAt`.

**PATCH /api/v1/devices/:id**

Update device (e.g. alias). Body: `{ "name": "string | null" }`. Returns 200 with `{ device: { id, imei, name, createdAt } }`. 404 if device not found.

**DELETE /api/v1/devices/:id**

Delete device and all its position history (cascade). Returns 204 No Content. 404 if device not found.

---

## Positions

**GET /api/v1/positions/latest**

Positions for a device, optionally in a time range. Query: `deviceId` (required), `limit` (optional, default 100, max 500), `from`, `to` (optional, ISO 8601). If `from` and `to` are set, returns positions in that range (newest first); otherwise latest by count. Response: `{ positions: [{ id, deviceId, timestamp, latitude, longitude, speed?, createdAt, attributes? }] }`. `attributes` (optional) contains OsmAnd extras: accuracy, altitude, battery_level, activity_type, etc.

**GET /api/v1/positions/stats**

Trip stats for a device in a time range. Query: `deviceId`, `from`, `to` (required, ISO 8601). Response: `{ from, to, odometerKm, maxSpeedKmh, avgSpeedKmh, pointCount, positions }`. Positions are ordered newest first. Odometer and speeds are computed from position data (haversine distance, segment or reported speed).

---

## Vehicles

**GET /api/v1/vehicles**

List vehicles. Query: `page`, `limit`. Response: paginated; each item includes id, name, description, licensePlate, vin, year, make, model, currentOdometer, fuelType, icon, deviceId, createdAt.

**GET /api/v1/vehicles/:id**

Get one vehicle. Returns 200 with `{ vehicle: { id, name, description, licensePlate, vin, year, make, model, currentOdometer, fuelType, icon, deviceId, createdAt } }`. 404 if not found.

**POST /api/v1/vehicles**

Create vehicle. Body: name (required), optional description, licensePlate, vin, year, make, model, currentOdometer, fuelType, icon, deviceId. Returns 201 with full vehicle object.

**PATCH /api/v1/vehicles/:id**

Update vehicle. Body: any of name, description, licensePlate, vin, year, make, model, currentOdometer, fuelType, icon, deviceId (all optional). Returns 200 with full vehicle. 404 if not found.

**GET /api/v1/vehicles/:id/fuel-records**

List fuel records for the vehicle (newest first). Returns 200 with `{ fuelRecords: [...] }`. Each record: id, vehicleId, date (ISO date-time), odometer, fuelQuantity, fuelCost, fuelRate, latitude, longitude, createdAt.

**POST /api/v1/vehicles/:id/fuel-records**

Add fuel record. Body: date (ISO date-time), odometer (int), fuelQuantity (number), and either fuelCost or fuelRate (the other is computed). If vehicle has a linked device, latest position at or before fill date is stored as latitude/longitude. Returns 201 with created fuelRecord.

**PATCH /api/v1/vehicles/:id/fuel-records/:recordId**

Update fuel record. Body: optional date, odometer, fuelQuantity, fuelCost, fuelRate. Returns 200 with updated fuelRecord. 404 if vehicle or record not found.

**DELETE /api/v1/vehicles/:id/fuel-records/:recordId**

Delete a fuel record. Returns 204 No Content. 404 if not found.

**GET /api/v1/vehicles/:id/trips**

Trips derived from the vehicle's linked device position data. Query: `from`, `to` (optional, ISO date; default last 7 days). A gap of more than 30 minutes between positions starts a new trip. Saved trip merges (see trip-merges) are applied so merged segments appear as one trip. Returns 200 with `{ trips: [{ startedAt, endedAt, startLat, startLon, endLat, endLon, distanceKm, pointCount }] }`. Empty if vehicle has no linked device.

**GET /api/v1/vehicles/:id/trip-merges**

List trip merges for the vehicle's device (gaps that are ignored when splitting trips). Returns 200 with `{ tripMerges: [{ id, gapAfter, gapBefore }] }` (ISO dates). Empty if no device or no merges.

**POST /api/v1/vehicles/:id/trip-merges**

Create a trip merge: ignore the gap between two segments so they are treated as one trip. Body: `{ "gapAfter": "ISO8601", "gapBefore": "ISO8601" }` (end of first segment, start of second). Returns 201 with `{ id, gapAfter, gapBefore }`. 400 if vehicle has no linked device.

**DELETE /api/v1/vehicles/:id/trip-merges**

Remove a trip merge. Query: `gapAfter`, `gapBefore` (required, ISO8601). Returns 204. 400 if params missing or invalid.

---

## Trips (stored)

Trips are stored in the database: created from a device time range or imported from GPX. List and filter via query params; no legacy “derived from positions only” list.

**GET /api/v1/trips**

List trips. Query: `vehicleId`, `deviceId`, `from`, `to` (optional, ISO), `page`, `limit`. Response: paginated `{ data: [...], pagination }`. Each item: id, deviceId, device?, vehicleId, vehicle?, startTime, endTime, name?, source ("device"|"imported"), createdAt.

**GET /api/v1/trips/:id**

Get one trip with positions and stats. Returns 200 with `{ trip, positions, stats: { odometerKm, maxSpeedKmh, avgSpeedKmh, pointCount } }`. 404 if not found.

**POST /api/v1/trips**

Create trip from device time range. Body: `deviceId`, `startTime`, `endTime` (ISO), optional `vehicleId`, `name`. Returns 201 with `{ trip }`.

**PATCH /api/v1/trips/:id**

Update trip. Body: `{ "name": "string" | null }` (optional). Returns 200 with `{ trip }`. 404 if not found.

**POST /api/v1/trips/:id/split**

Split trip at a time. Body: `{ "splitAt": "ISO8601" }`. splitAt must be strictly between trip startTime and endTime. Creates two trips (names suffixed with " (1)" and " (2)"), deletes the original. For imported trips, positions are split at the nearest point; for device trips, two new trip records with the new time ranges. Returns 201 with `{ trips: [{ id, startTime, endTime, name }, ...] }`. 400 if splitAt invalid or no position at split.

**POST /api/v1/trips/import-gpx**

Import a GPX file as a trip (multipart: file; optional query/body vehicleId, name). Returns 201 with `{ trip }`.

**DELETE /api/v1/trips/:id**

Delete trip and its positions. Returns 204. 404 if not found.

---

## Maintenance

**GET /api/v1/maintenance/:vehicleId**

List maintenance records for a vehicle. Query: `page`, `limit`. Response: paginated; each item: `id`, `vehicleId`, `type`, `notes`, `odometer`, `cost`, `date`, `receiptPath`, `createdAt`.

**POST /api/v1/maintenance**

Create record. Body: `{ "vehicleId": "uuid", "type": "service"|"repair"|"inspection"|"other", "date": "ISO8601", "notes": "optional", "odometer": number optional, "cost": number optional }`. Returns 201 with `{ record: { ... } }`.

**PATCH /api/v1/maintenance/:id**

Update record. Body: optional type, date, notes, odometer, cost. Returns 200 with updated record. 404 if not found.

**POST /api/v1/maintenance/:id/receipt**

Upload receipt image (multipart file). Stores file under uploads; record's receiptPath is set. Returns 200 with updated record.

**GET /api/v1/maintenance/:id/receipt**

Stream receipt image. Returns 404 if no receipt. Content-Type from file extension.

**DELETE /api/v1/maintenance/:id**

Delete maintenance record. Returns 204. 404 if not found.

---

## Raw log (debug)

**GET /api/v1/raw-log**

In-memory buffer of recent protocol traffic (GT06 port 5051, OsmAnd port 5055). Query: `port` (optional, 5051 or 5055), `limit` (optional, default 100, max 200). Response: `{ entries: [{ at, port, raw, remoteAddress? }] }`. Data is not persisted; buffer is cleared on server restart. Requires auth.

---

## System

**POST /api/v1/system/backup/export**

No body. Creates a backup in a temp dir (pg_dump + gzip), returns the `.sql.gz` file as the response body with `Content-Disposition: attachment` (like Export GPX). No server backup folder needed. Use this for the Settings “Export database” flow.

**POST /api/v1/system/backup**

Body: `{ "backupDir": "string (optional)" }` (default `./backups`). Creates a backup (db.sql.gz + metadata) on the server and returns 201 with `{ status, backup: { path, timestamp, downloadPath } }`. Use with the download endpoint if you need server-side backup files.

**GET /api/v1/system/backup/download**

Query: `path` (required, backup folder name e.g. from backup.downloadPath). Streams the backup db.sql.gz as attachment. 400 if invalid path, 404 if not found.

**POST /api/v1/system/restore**

Body: `{ "backupPath": "string" }`. Restores DB from a backup directory on the server. Application may need restart after restore. Returns 200 with `{ status, restore: { status: "restored" } }`.

**POST /api/v1/system/restore/upload**

Multipart: upload a `.sql.gz` file (from Export database). Server writes to a temp dir, **drops the current database, recreates it, and restores** the uploaded dump so the DB contains only the imported data. Returns 200 with `{ status, restore }`. You will need to log in again after restore.

**POST /api/v1/system/clear-trips**

Body: `{ "includeTracking": boolean (optional) }`. Deletes only trip-related data; vehicles, maintenance, fuel, devices, and users are left unchanged. Always deletes: TripPosition, Trip. If `includeTracking` is true, also deletes Position and TripMerge (all device positions and trip-merge metadata). Returns 200 with `{ status, message }`.

**POST /api/v1/system/clear-database**

Body: none. Deletes all app data (TripPosition, Trip, FuelRecord, MaintenanceRecord, Position, TripMerge, Vehicle, Device, User) in dependency order. Returns 200 with `{ status, message }`. Irreversible.
