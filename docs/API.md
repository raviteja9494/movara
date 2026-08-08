# API reference

Endpoints return JSON unless an entry explicitly documents a text/binary response or 204 No Content. Base path: `/api/v1`. Pagination uses `page` (1-based) and `limit` (max 100); defaults page=1, limit=10 unless noted otherwise. See [DEVELOPMENT.md](DEVELOPMENT.md) for error envelope and pagination format.

## Health

**GET /health**

Returns `{ "status": "ok" }`. No auth.

---

## Rate limits

Limits are per source IP in a one-minute window. All HTTP routes allow 300 requests per minute by default. `POST /api/v1/auth/login` and `POST /api/v1/auth/register` allow 5 requests per minute. Every `/api/v1/system/*` route (including backup, restore, and database-clearing operations) allows 10 requests per minute. A limit breach returns HTTP 429.

---

## Authentication

Except for `GET /health` and the two `/api/v1/auth/*` endpoints, every `/api/v1` route requires `Authorization: Bearer <token>`. A missing or malformed header returns 401 with `{ error: true, message: "Missing or invalid Authorization header" }`; an invalid or expired token returns 401 with `{ error: true, message: "Invalid or expired token" }`.

**POST /api/v1/auth/register**

Create an account. No auth. Body: `{ "email": "valid email", "password": "at least 8 characters" }`. The email is trimmed and lowercased. Returns 201 with `{ user: { id, email }, token }`. The first account can always register; later registration depends on `ALLOW_REGISTRATION`. Duplicate or disabled registration returns 409.

**POST /api/v1/auth/login**

Authenticate an account. No auth. Body: `{ "email": "valid email", "password": "non-empty string" }`. The email is trimmed and lowercased. Returns 200 with `{ user: { id, email }, token }`. Both an unknown email and a wrong password return 401 with the same `{ error: true, message: "Invalid email or password" }` response.

---

## Devices

**GET /api/v1/devices**

List devices. Query: `page`, `limit`. Response: `{ data: [...], pagination: { total, page, limit, pages, hasNextPage, hasPreviousPage } }`. Each item: `id`, `imei`, `name`, `createdAt`.

**POST /api/v1/devices**

Body: `{ "imei": "string", "name": "string?" }`. Provisions a tracker for the authenticated tenant. Protocol connections and mobile position ingestion reject unknown or foreign IMEIs.

**PATCH /api/v1/devices/:id**

Update device (e.g. alias). Body: `{ "name": "string | null" }`. Returns 200 with `{ device: { id, imei, name, createdAt } }`. 404 if device not found.

**DELETE /api/v1/devices/:id**

Delete device and all its position history (cascade). Returns 204 No Content. 404 if device not found.

### Device commands

All device-command routes require bearer auth and enforce device ownership. Command support is determined by the tracker's active protocol and is available for Eelink and GT06 devices.

**GET /api/v1/devices/:id/commands/available**

Describe commands supported by the device and whether a live command connection is present. Returns `{ device, protocol, supportsCommands, commandConnected, commands }`. `device` contains `{ id, imei, name, osmandSecretConfigured, createdAt, lastSeen, status, protocol, lastAttributes, packetAttributes }`. Each command definition contains `{ key, label, description, category, protocols, fields }`; category is `setup`, `control`, `query`, `obd`, or `custom`. Each field contains `key`, `label`, `type` (`text`, `number`, `select`, or `textarea`) and optional `required`, `placeholder`, `helpText`, and `options` (`{ value, label }` pairs).

**GET /api/v1/devices/:id/commands**

Return the 30 most recent command records as `{ commands: [...] }`. Each record contains `id`, `deviceId`, `imei`, `protocol`, `commandKey`, `commandLabel`, `content`, `transport`, `serverFlag`, `status` (`pending`, `sent`, `responded`, or `failed`), `createdAt`, `sentAt`, `respondedAt`, `response`, and `error`.

**POST /api/v1/devices/:id/commands**

Queue or send a device command. Body: `{ "commandKey": "string", "values": { "fieldKey": "string" } }`; `values` is optional and defaults to `{}`. Returns 200 with `{ command }` using the command-record shape above. The record remains `pending` when the device is disconnected, becomes `sent` when delivered to a live connection, or `failed` if delivery fails.

---

## Positions

**GET /api/v1/positions/latest**

Positions for a device, optionally in a time range. Query: `deviceId` (required), `limit` (optional, default 100, max 500), `from`, `to` (optional, ISO 8601). If `from` and `to` are set, returns positions in that range (newest first); otherwise latest by count. Response: `{ positions: [{ id, deviceId, timestamp, latitude, longitude, speed?, createdAt, attributes? }] }`. `attributes` (optional) contains extra telemetry such as accuracy, altitude, battery_level, activity_type, ignition, charging, GSM signal, and other protocol-specific values.

**GET /api/v1/positions/stats**

Trip stats for a device in a time range. Query: `deviceId`, `from`, `to` (required, ISO 8601). Response: `{ from, to, odometerKm, maxSpeedKmh, avgSpeedKmh, pointCount, positions }`. Positions are ordered newest first. Odometer and speeds are computed from position data (haversine distance, segment or reported speed).

---

## Mobile ingestion

These endpoints are used by the Movara companion app. Both require bearer auth and accept data only for a tracker already provisioned to that tenant.

**POST /api/v1/mobile/positions**

Record a phone position. Body: `{ "deviceLabel": "string?", "timestamp": "ISO8601", "latitude": number, "longitude": number, "speed": number|null?, "accuracy": number|null?, "altitude": number|null?, "batteryLevel": number|null? }`. `deviceLabel` is limited to 80 characters and defaults to `phone`; the backend normalizes it into the provisioned IMEI `movara-mobile-<userId>-<label>`. Latitude is limited to -90..90, longitude to -180..180, speed and accuracy must be non-negative, and batteryLevel is 0..100. Returns 201 with `{ position: { id, deviceId, timestamp, latitude, longitude, speed, attributes } }`; attributes include `source: "movara_android"` and any supplied accuracy, altitude, and battery level.

**POST /api/v1/mobile/tracker-state**

Report that the companion tracker started or stopped. Body: `{ "deviceLabel": "string", "active": boolean, "protocol": "osmand"? }`; deviceLabel is required and limited to 80 characters, protocol defaults to `osmand`, and the provisioned IMEI must be `osmand-<deviceLabel>`. Updates device state and emits the corresponding online/offline event. Returns 200 with `{ device: { imei, status, lastSeen, protocol } }`.

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

**DELETE /api/v1/vehicles/:id**

Delete an owned vehicle. Requires bearer auth. Returns 204 No Content. Returns 404 when the vehicle does not exist or is not accessible to the tenant.

**POST /api/v1/vehicles/:id/photo**

Upload or replace a vehicle photo. Requires bearer auth. Multipart request with one file; accepted extensions are jpg, jpeg, png, gif, and webp, and the maximum size is 1 MB. The claimed extension and MIME type must match the file contents. Returns 200 with `{ vehicle }`, including the updated `photoPath`. Invalid types return 400 and oversized files return 413.

**GET /api/v1/vehicles/:id/photo**

Stream the stored photo bytes with their image MIME type. Requires bearer auth. Returns 404 if the vehicle has no photo.

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

All trip routes require bearer auth and enforce tenant ownership.

Trips are stored in the database: created from a device time range or imported from GPX. List and filter via query params; no legacy “derived from positions only” list.

**GET /api/v1/trips**

List trips. Query: `vehicleId`, `deviceId`, `from`, `to` (optional, ISO), `page`, `limit`. Response: paginated `{ data: [...], pagination }`. Each item: id, deviceId, device?, vehicleId, vehicle?, startTime, endTime, name?, source, createdAt. Current sources include manual/device-created trips, imported GPX trips, and automatic ignition-driven trips.

**GET /api/v1/trips/:id**

Get one trip with positions and stats. Returns 200 with `{ trip, positions, stats: { odometerKm, maxSpeedKmh, avgSpeedKmh, pointCount } }`. Returned positions can include optional `attributes` telemetry when the source data provided it. 404 if not found.

**POST /api/v1/trips**

Create trip from device time range. Body: `deviceId`, `startTime`, `endTime` (ISO), optional `vehicleId`, `name`. Returns 201 with `{ trip }`.

**PATCH /api/v1/trips/:id**

Update trip. Body: `{ "name": "string" | null }` (optional). Returns 200 with `{ trip }`. 404 if not found.

**POST /api/v1/trips/:id/split**

Split trip at a time. Body: `{ "splitAt": "ISO8601" }`. splitAt must be strictly between trip startTime and endTime. Creates two trips (names suffixed with " (1)" and " (2)"), deletes the original. For imported trips, positions are split at the nearest point; for device trips, two new trip records with the new time ranges. Returns 201 with `{ trips: [{ id, startTime, endTime, name }, ...] }`. 400 if splitAt invalid or no position at split.

**POST /api/v1/trips/:id/stops**

Add a manually labelled stop to a trip. Body: `{ "label": "string", "startTime": "ISO8601", "endTime": "ISO8601?", "latitude": number, "longitude": number }`. `startTime` and any `endTime` must fall within the trip; endTime must be later than startTime. Returns 201 with `{ stop: { id, label, startTime, endTime, latitude, longitude, sortOrder } }`.

**PATCH /api/v1/trips/:id/stops/:stopId**

Update an owned stop belonging to the trip. Body: optional `{ "label": "string", "endTime": "ISO8601" | null }`; null clears the end time. Returns 200 with `{ stop }` using the shape above. Returns 404 if the trip or stop is not found and 400 for an invalid time range.

**DELETE /api/v1/trips/:id/stops/:stopId**

Delete an owned stop belonging to the trip. Returns 204 No Content. Returns 404 if the trip or stop is not found.

**POST /api/v1/trips/:id/merge**

Replace the trip identified by `:id` and another trip with one merged trip. Body: `{ "targetTripId": "uuid" }`. The two trips must be distinct, have the same source type, share a vehicle or device, and must not identify conflicting vehicles or devices. Stops are retained; imported points are combined; and a device gap marker is recorded when applicable. Returns 201 with `{ trip, mergedTripId, deletedTripIds }`, where `trip` is the normal trip summary and `deletedTripIds` contains both original IDs.

**GET /api/v1/trips/:id/fusion-candidates**

Find trips from other trackers that may supplement this trip. Returns 200 with `{ candidates: [...] }`, ranked by confidence. Each candidate contains `{ trip, pointCount, overlapMs, overlapPercent, matchedSamples, medianDistanceMeters, confidence, coverageGainPoints, warnings }`; `confidence` is `high`, `medium`, or `low`, and `trip` is the normal trip summary.

**POST /api/v1/trips/:id/fuse**

Create a new imported trip by filling temporal gaps in one selected track with points from another tracker; the source trips are retained. Body: `{ "targetTripId": "uuid", "primaryTripId": "uuid?", "gapThresholdMinutes": number?, "name": "string|null?" }`. `primaryTripId`, when supplied, must identify one of the two selected trips. `gapThresholdMinutes` defaults to 5 and is limited to 1..120. Low-confidence pairs are rejected. Returns 201 with `{ trip, fusedTripId, pointCount, evaluation }`; evaluation contains `overlapMs`, `overlapPercent`, `matchedSamples`, `medianDistanceMeters`, `confidence`, `coverageGainPoints`, and `warnings`.

**POST /api/v1/trips/import-gpx**

Import a GPX file as a trip (multipart: file; optional query/body vehicleId, name). Returns 201 with `{ trip }`.

**DELETE /api/v1/trips/:id**

Delete trip and its positions. Returns 204. 404 if not found.

---

## Saved locations

All saved-location routes require bearer auth and are tenant-scoped. A location object contains `{ id, name, latitude, longitude, notes, createdAt, updatedAt, userId }`.

**GET /api/v1/locations**

List the tenant's saved locations alphabetically by name. Returns 200 with `{ locations: [...] }`.

**POST /api/v1/locations**

Create a saved location. Body: `{ "name": "string", "latitude": number, "longitude": number, "notes": "string|null?" }`. Name is required and limited to 255 characters, notes to 1,000 characters, latitude to -90..90, and longitude to -180..180. Returns 201 with `{ location }`.

**PATCH /api/v1/locations/:id**

Update an owned saved location. Body: any of `name`, `latitude`, `longitude`, or `notes` with the same constraints as creation; `notes: null` clears the notes. Returns 200 with `{ location }`. Returns 404 when the location is not found or is not accessible to the tenant.

**DELETE /api/v1/locations/:id**

Delete an owned saved location. Returns 204 No Content. Returns 404 when the location is not found or is not accessible to the tenant.

---

## Vehicle records

Vehicle records are the general representation for maintenance, documents, subscriptions, expenses, and accessories. These routes and the legacy `/api/v1/maintenance*` routes use the same `MaintenanceUseCases` and underlying `VehicleRecord` data. `/api/v1/maintenance` is a narrower, backward-compatible view that filters to `type: "maintenance"` and maps `subtype`/`amount`/`attachmentPath` to the older `type`/`cost`/`receiptPath` names. All routes require bearer auth and enforce record and vehicle ownership.

A vehicle-record response contains `{ id, vehicleId, vehicleName, type, subtype, title, notes, amount, odometer, date, validFrom, validUntil, provider, referenceNumber, reminderMode, reminderDaysBefore, recurringIntervalDays, recurringIntervalKm, attachmentPath, createdAt, updatedAt }`.

**GET /api/v1/vehicle-records**

List vehicle records. Query: optional `vehicleId`, optional `type`, `page` (default 1), and `limit` (default 20, max 100). `type` is `maintenance`, `document`, `subscription`, `expense`, or `accessory`. Returns the standard `{ data, pagination }` response.

**POST /api/v1/vehicle-records**

Create a record. Body requires `vehicleId` (UUID), `type`, `title` (1..255 characters), and `date` (ISO 8601). Optional fields are `subtype`, `notes`, `amount` (non-negative), `odometer` (non-negative integer), `validFrom`, `validUntil`, `provider`, `referenceNumber`, `reminderMode`, `reminderDaysBefore` (0..365), `recurringIntervalDays` (positive integer), and `recurringIntervalKm` (positive integer). Supported subtypes are `service`, `repair`, `inspection`, `other`, `insurance_third_party`, `insurance_own_damage`, `pollution_check`, `registration`, `sim_recharge`, `tracker_purchase`, `accessory_purchase`, `permit`, `warranty`, and `custom`. `reminderMode` is `none` (default), `on_date`, `recurring_date`, or `recurring_odometer`. Returns 201 with `{ record }`.

**PATCH /api/v1/vehicle-records/:id**

Update an owned record. Body accepts any create field except `vehicleId`; all are optional and use the same validation. Returns 200 with `{ record }`. Returns 404 when the record is not found or inaccessible.

**DELETE /api/v1/vehicle-records/:id**

Delete an owned vehicle record and its stored attachment. Returns 204 No Content.

**POST /api/v1/vehicle-records/:id/attachment**

Upload or replace an attachment. Multipart request with one file; accepted extensions are jpg, jpeg, png, gif, webp, and pdf, and the maximum size is 1 MB. The claimed extension and MIME type must match the file contents. The bytes are stored in PostgreSQL. Returns 200 with `{ record }`, including the updated `attachmentPath`. Invalid types return 400 and oversized files return 413.

**GET /api/v1/vehicle-records/:id/attachment**

Stream the stored attachment inline using its saved MIME type and a `record-<id>.<ext>` filename. Returns 404 when no attachment exists.

---

## Maintenance

The maintenance endpoints are the backward-compatible maintenance-only view of the same `VehicleRecord` data and `MaintenanceUseCases` described above. They require bearer auth. Each maintenance item is `{ id, vehicleId, vehicleName, type, notes, odometer, cost, date, receiptPath, createdAt }`, where `type` is derived from the record subtype and `cost` is the general record's `amount`.

**GET /api/v1/maintenance**

List maintenance records across all vehicles for the tenant. Query: `page`, `limit`. Returns the standard paginated response containing only vehicle records whose general `type` is `maintenance`.

**GET /api/v1/maintenance/:vehicleId**

List maintenance records for a vehicle. Query: `page`, `limit`. Response: paginated; each item: `id`, `vehicleId`, `type`, `notes`, `odometer`, `cost`, `date`, `receiptPath`, `createdAt`.

**POST /api/v1/maintenance**

Create record. Body: `{ "vehicleId": "uuid", "type": "service"|"repair"|"inspection"|"other", "date": "ISO8601", "notes": "optional", "odometer": number optional, "cost": number optional }`. Returns 201 with `{ record: { ... } }`.

**PATCH /api/v1/maintenance/:id**

Update record. Body: optional type, date, notes, odometer, cost. Returns 200 with updated record. 404 if not found.

**POST /api/v1/maintenance/:id/receipt**

Upload or replace the record attachment through the legacy receipt path. Multipart request with one jpg, jpeg, png, gif, webp, or pdf file, maximum 1 MB. Stores the bytes in PostgreSQL and returns 200 with `{ record }` using the general vehicle-record response shape; `receiptPath` in maintenance list responses maps to that record's `attachmentPath`.

**GET /api/v1/maintenance/:id/receipt**

Stream the stored receipt/attachment inline using its saved MIME type. Returns 404 if no attachment exists.

**DELETE /api/v1/maintenance/:id**

Delete maintenance record. Returns 204. 404 if not found.

---

## Raw log (debug)

**GET /api/v1/raw-log**

Recent raw tracker traffic persisted in PostgreSQL. Requires both bearer auth and `X-Movara-Admin-Token`. Query: `port` (optional numeric protocol port, normally GT06 5023, Eelink 5064, or OsmAnd 5055) and `limit` (optional, default 100, max 200). Returns `{ entries: [{ at, port, raw, kind?, remoteAddress? }] }` newest first. `kind`, when present, is `chunk`, `packet`, `connect`, `tls-error`, or `socket-error`. The store retains the latest 500 entries across protocols and deletes older rows as new entries arrive, so data survives server restarts.

**DELETE /api/v1/raw-log**

Delete every persisted raw-log entry. Requires both bearer auth and `X-Movara-Admin-Token`. Returns 204 No Content.

The raw-log table is separate from the daily `.jsonl`/`.log` protocol files. File logging is controlled by the runtime settings documented below and writes under `protocolDebugDir`; file retention keeps the latest four files per protocol/log prefix.

---

## Home Assistant

**GET /api/v1/home-assistant/snapshot**

Return one tenant-scoped polling snapshot for the Home Assistant integration. Requires bearer auth; unlike `/api/v1/system/*`, it does not require the operator token. Returns 200 with `{ devices, vehicles }`.

Each device contains `id`, `imei`, `name`, `createdAt`, `lastSeen`, `status`, `protocol`, `lastAttributes`, `packetAttributes`, `latest_position`, and `latest_command`. `packetAttributes` items contain `{ packetId, updatedAt, attributes }`. `latest_position` is null or `{ id, deviceId, timestamp, latitude, longitude, speed, createdAt, attributes? }`. `latest_command` is null or a serialized command record with the fields documented under Device commands.

Each vehicle contains `id`, `name`, `description`, `licensePlate`, `vin`, `year`, `make`, `model`, `currentOdometer`, `estimatedOdometerKm`, `estimatedOdometerCalibratedAt`, `fuelType`, `icon`, `photoPath`, `deviceId`, `createdAt`, `latest_trip`, and `reminders`. `latest_trip` is null or the latest non-active trip summary plus `stats: { odometerKm, maxSpeedKmh, avgSpeedKmh, pointCount }` and `durationSeconds`. `reminders` contains `{ status, summary, configuredCount, dueCount, overdueCount, activeCount, nextReminder, items, currentOdometerKm, updatedAt }`, with status `overdue`, `due`, `ok`, or `none`. Each reminder item contains `{ id, title, recordType, recordSubtype, mode, kind, severity, detail, dueAt, daysRemaining, dueOdometerKm, remainingKm, currentOdometerKm }`.

---

## System

All `/api/v1/system/*` routes are instance-wide operator operations and require both the normal bearer JWT and `X-Movara-Admin-Token`. Tenant JWTs alone receive 403.

### Runtime settings

Runtime settings are persisted in PostgreSQL. Every response uses `{ settings: { protocolDebugEnabled, protocolDebugDir, protocolLogLevel, appLogLevel, autoStopMinDurationMinutes, autoStopMoveThresholdMeters, autoStopMinPoints } }`.

`protocolLogLevel` is one of `silent`, `error`, `warn`, `info`, `debug`, `trace`, or `raw`; `protocolDebugEnabled` reflects whether that level is not `silent`. `appLogLevel` is one of `silent`, `error`, `warn`, `info`, `debug`, or `trace`. The auto-stop fields control stop-based trip splitting: minimum stop duration in minutes, maximum movement during the stop in meters, and minimum qualifying points.

**GET /api/v1/system/runtime-settings**

Return the current settings. Returns 200 with `{ settings }`.

**POST /api/v1/system/runtime-settings**

Partially update settings. Body may contain `protocolDebugEnabled` (boolean), `protocolDebugDir` (non-empty string), `protocolLogLevel`, `appLogLevel`, `autoStopMinDurationMinutes` (number), `autoStopMoveThresholdMeters` (number), and `autoStopMinPoints` (number). Numeric values are rounded and clamped respectively to 1..60 minutes, 5..1,000 meters, and 2..20 points. Returns 200 with the complete normalized `{ settings }`; the app log level takes effect immediately.

### Log files

These routes manage daily application and protocol files under the configured `protocolDebugDir`. Accepted names match `app|gt06|eelink|osmand` followed by `-YYYY-MM-DD` and `.jsonl` or `.log`; arbitrary paths are rejected with 400.

**GET /api/v1/system/logs**

List recognized log files, newest filename first. Returns 200 with `{ files: [{ name, size, modifiedAt }] }`; `size` is bytes and `modifiedAt` is ISO 8601.

**GET /api/v1/system/logs/content**

Read a complete log file. Query: `name` (required). Returns the file as `text/plain; charset=utf-8`. Returns 400 for a missing or invalid name and 404 when the file does not exist.

**GET /api/v1/system/logs/preview**

Read the tail of a log file. Query: `name` (required), `maxBytes` (optional, default 200,000, clamped to 1,024..1,000,000). Returns 200 with `{ name, content, truncated, size }`; truncated previews include a marker before the returned tail. Returns 400 for a missing or invalid name and 404 when not found.

**GET /api/v1/system/logs/download**

Download a complete log file. Query: `name` (required). Returns `text/plain; charset=utf-8` with `Content-Disposition: attachment`. Returns 400 for a missing or invalid name and 404 when not found.

**DELETE /api/v1/system/logs**

Delete one log file. Query: `name` (required). Returns 204 No Content. Returns 400 for a missing or invalid name and 404 when not found.

**POST /api/v1/system/backup/export**

No body. Creates a backup in a temp dir (pg_dump + gzip), returns the `.sql.gz` file as the response body with `Content-Disposition: attachment` (like Export GPX). No server backup folder needed. Use this for the Settings “Export database” flow.

**POST /api/v1/system/backup**

Body: `{}`. Creates a backup (db.sql.gz + metadata) under the configured server backup directory and returns 201 with `{ status, backup: { path, timestamp, downloadPath } }`. Request-supplied backup directories are ignored for safety.

**GET /api/v1/system/backup/download**

Query: `path` (required, backup folder name e.g. from backup.downloadPath). Streams the backup db.sql.gz as attachment. 400 if invalid path, 404 if not found.

**POST /api/v1/system/restore**

Body: `{ "backupPath": "string" }`. Restores DB from a backup directory on the server. The path must be inside the configured backup directory. Application may need restart after restore. Returns 200 with `{ status, restore: { status: "restored" } }`.

**POST /api/v1/system/restore/upload**

Multipart: upload a `.sql.gz` file (from Export database). Server writes to a temp dir, **drops the current database, recreates it, and restores** the uploaded dump so the DB contains only the imported data. Returns 200 with `{ status, restore }`. You will need to log in again after restore.

**POST /api/v1/system/clear-trips**

Body: `{ "includeTracking": boolean (optional) }`. Deletes only trip-related data; vehicles, maintenance, fuel, devices, and users are left unchanged. Always deletes: TripPosition, Trip. If `includeTracking` is true, also deletes Position and TripMerge (all device positions and trip-merge metadata). Returns 200 with `{ status, message }`.

**POST /api/v1/system/clear-database**

Body: none. Deletes raw-log entries, saved locations, trips and trip positions, fuel records, vehicle records (including maintenance), positions, trip merges, vehicles, devices, users, and persisted runtime settings in dependency order; runtime settings are then recreated with defaults. Returns 200 with `{ status, message }`. Irreversible.
