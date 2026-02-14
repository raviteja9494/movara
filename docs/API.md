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

---

## Positions

**GET /api/v1/positions/latest**

Latest positions for a device. Query: `deviceId` (required, UUID), `limit` (optional, default 10, max 100). Response: `{ positions: [{ id, deviceId, timestamp, latitude, longitude, speed?, createdAt }] }`.

---

## Vehicles

**GET /api/v1/vehicles**

List vehicles. Query: `page`, `limit`. Response: paginated; each item: `id`, `name`, `description`, `createdAt`.

**POST /api/v1/vehicles**

Create vehicle. Body: `{ "name": "string", "description": "string (optional)" }`. Validation: name required, max lengths (e.g. 255 / 1000). Returns 201 with `{ vehicle: { id, name, description, createdAt } }`.

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
