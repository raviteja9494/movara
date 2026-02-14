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

Positions for a device, optionally in a time range. Query: `deviceId` (required), `limit` (optional, default 100, max 500), `from`, `to` (optional, ISO 8601). If `from` and `to` are set, returns positions in that range (newest first); otherwise latest by count. Response: `{ positions: [{ id, deviceId, timestamp, latitude, longitude, speed?, createdAt }] }`.

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

Update vehicle. Body: `{ "deviceId": "uuid | null", "icon": "string | null" }`. Returns 200 with full vehicle. 404 if not found.

**GET /api/v1/vehicles/:id/fuel-records**

List fuel records for the vehicle (newest first). Returns 200 with `{ fuelRecords: [...] }`. Each record: id, vehicleId, date, odometer, fuelQuantity, fuelCost, fuelRate, latitude, longitude, createdAt.

**POST /api/v1/vehicles/:id/fuel-records**

Add fuel record. Body: date (ISO), odometer (int), fuelQuantity (number), and either fuelCost or fuelRate (the other is computed). If vehicle has a linked device, latest position at or before fill date is stored as latitude/longitude. Returns 201 with created fuelRecord.

**GET /api/v1/vehicles/:id/trips**

Trips derived from the vehicle's linked device position data. Query: `from`, `to` (optional, ISO date; default last 7 days). A gap of more than 30 minutes between positions starts a new trip. Returns 200 with `{ trips: [{ startedAt, endedAt, startLat, startLon, endLat, endLon, distanceKm, pointCount }] }`. Empty if vehicle has no linked device.

---

## Maintenance

**GET /api/v1/maintenance/:vehicleId**

List maintenance records for a vehicle. Query: `page`, `limit`. Response: paginated; each item: `id`, `vehicleId`, `type`, `notes`, `odometer`, `date`, `createdAt`.

**POST /api/v1/maintenance**

Create record. Body: `{ "vehicleId": "uuid", "type": "service"|"fuel"|"repair"|"inspection"|"other", "date": "ISO8601", "notes": "optional", "odometer": number optional }`. Returns 201 with `{ record: { ... } }`.

---

## System

**POST /api/v1/system/backup**

Body: `{ "backupDir": "string (optional)" }` (default `./backups`). Returns 201 with `{ status, backup: { path, timestamp } }`.

**POST /api/v1/system/restore**

Body: `{ "backupPath": "string" }`. Restores DB from backup. Application may need restart after restore. Returns 200 with `{ status, restore: { status: "restored" } }`.
