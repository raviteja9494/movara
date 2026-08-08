# Architecture

Movara is an **API-only** application: **Node.js**, **TypeScript**, **Fastify**, **Prisma**, **PostgreSQL**. It uses a **modular monolith** with clear module boundaries. Do not restructure this layout; extend within it.

## Folder layout

```
src/
├── main.ts                 # Entry: Fastify app, CORS, routes, listen
├── app/                    # App-level: error handling (src/app/index.ts)
├── modules/
│   ├── tracking/           # Devices, positions, GT06 protocol
│   ├── auth/               # Registration, login, password hashing, JWTs
│   ├── vehicles/           # Vehicle registry, fuel records
│   ├── trips/              # Stored trips (device time range or GPX import)
│   ├── maintenance/        # Maintenance records
│   ├── locations/          # Tenant-scoped saved locations
│   └── system/             # Backup, restore, clear-database, clear-trips
├── infrastructure/         # Cross-cutting backup support
└── shared/                 # Errors, validation, utils, types
```

## Module structure (per module)

Each module uses three layers:

- **domain/** — Entities, repository interfaces (no DB, no Fastify).
- **application/** — Use cases, DTOs; orchestrate domain + repositories.
- **infrastructure/** — API routes (Fastify), persistence (Prisma), protocols.

Domain does not depend on infrastructure. Infrastructure implements domain interfaces and registers HTTP routes.

## Modules overview

| Module | Role |
|--------|------|
| **auth** | Account registration and login; password hashing, bearer-token creation, verification, and authenticated user identity. |
| **tracking** | Devices (IMEI + optional name), positions; GT06 TCP server, parser, protocol; persistence and device/position API. |
| **vehicles** | Vehicle registry (name, description, optional device link, photo); CRUD, fuel records (date-time, odometer, quantity, cost); trip merges (persisted gaps); list and detail API. |
| **trips** | Stored trips: create from device time range or import GPX; list, get, delete; positions and stats. |
| **maintenance** | General vehicle records plus the backward-compatible maintenance view; CRUD, reminders, and PostgreSQL-backed attachments. |
| **locations** | Tenant-scoped named latitude/longitude bookmarks with optional notes; list, create, update, and delete API. |
| **system** | Backup (create, download), restore (path or upload), clear-database (wipe all), clear-trips (trips only, optional tracking). |

## Domain model (main entities)

- **Device** — Persisted scalar fields: `id String` (UUID), `imei String`, `name String?`, `status String` (default `"offline"`), `statusUpdatedAt DateTime?`, `lastSeen DateTime?`, `protocol String` (default `"unknown"`), `osmandSecretHash String?`, `lastAttributes Json?`, `createdAt DateTime`, and `userId String` (UUID). Lives in tracking.
- **Position** — id, deviceId, timestamp, latitude, longitude, speed?, attributes? (JSON: OsmAnd extras — accuracy, altitude, battery_level, etc.), createdAt.
- **Vehicle** — id, name, description?, deviceId?, photoPath?, createdAt.
- **FuelRecord** — id, vehicleId, date, odometer, fuelQuantity, fuelCost?, fuelRate?, latitude?, longitude?, createdAt.
- **Trip** — Persisted scalar fields: `id String` (UUID), `deviceId String?` (UUID), `vehicleId String?` (UUID), `startTime DateTime`, `endTime DateTime`, `name String?`, `favorite Boolean` (default `false`), `source String` (default `"device"`), `createdAt DateTime`, and `userId String` (UUID). Source values currently produced by the backend are `"device"`, `"imported"`, `"auto-ignition-active"`, and `"auto-ignition"`; imported/fused routes store their points as TripPosition rows.
- **TripStop** — Persisted scalar fields: `id String` (UUID), `tripId String` (UUID), `label String`, `startTime DateTime`, `endTime DateTime?`, `latitude Float`, `longitude Float`, `sortOrder Int` (default `0`), and `userId String` (UUID).
- **TripPosition** — id, tripId, latitude, longitude, timestamp, speed?, sortOrder (for imported GPX).
- **TripMerge** — id, deviceId, gapAfter, gapBefore (persisted “ignore this gap” so trips are merged).
- **VehicleRecord** — Persisted scalar fields: `id String` (UUID), `vehicleId String` (UUID), `type String`, `subtype String?`, `title String`, `notes String?`, `amount Float?`, `odometer Int?`, `date DateTime`, `validFrom DateTime?`, `validUntil DateTime?`, `provider String?`, `referenceNumber String?`, `reminderMode String` (default `"none"`), `reminderDaysBefore Int?`, `recurringIntervalDays Int?`, `recurringIntervalKm Int?`, `attachmentPath String?`, `attachmentData Bytes?`, `attachmentMimeType String?`, `attachmentFilename String?`, `createdAt DateTime`, `updatedAt DateTime`, and `userId String` (UUID). This model backs both the general `/api/v1/vehicle-records` API and the narrower backward-compatible `/api/v1/maintenance` API.

## Persistence

- **Domain** defines repository interfaces (e.g. `DeviceRepository`, `PositionRepository`).
- **Infrastructure** implements them with Prisma in `src/modules/*/infrastructure/persistence/`.
- `src/composition-root.ts` constructs one Prisma client and injects repositories, use cases, stores, and route dependencies. No module reaches for a global database client.
- Durable device state, command history/payloads, raw logs, saved locations, runtime settings, and uploaded vehicle/record files all live in PostgreSQL.
- `LiveDeviceConnectionRegistry` is intentionally process-local because active TCP sockets cannot be serialized.

## Multi-tenant ownership

`User` is the tenant boundary. Devices, vehicles, trips, saved locations, and their dependent rows carry an explicit `userId`. HTTP routes pass the JWT `sub` claim into use cases; a shared ownership policy returns not-found for resources owned by another tenant. GPS protocol connections may update only pre-provisioned devices and cannot create unowned records. Instance-wide system administration uses a separate operator token rather than tenant authority.

## Data flow (high level)

- **HTTP** — Request → Fastify route (module’s infrastructure/api) → shared validation (Zod) → domain/use case → repository → response.
- **GT06** — TCP (port 5023) → Gt06Server (per-socket buffer, extract full packets) → Gt06Protocol / Gt06Parser → decoded payload → ProcessIncomingPositionUseCase → repositories + events. IMEI is tracked per connection so GPS can be attributed after login.

## Web UI

- **Location:** `webui/` — React, Vite, TypeScript; minimal, no heavy UI framework. Maps via Leaflet + OpenStreetMap (direction arrows when device sends heading).
- **Role:** **Overview** (summary stats, device positions map, recent trips/maintenance), **Tracking** (time-range positions, map, stats, live refresh, GPX export), **Vehicles** (list + detail: fuel records with date-time, mileage from odometer, bar chart, maintenance), **Trips** (list stored trips, create from device range or import GPX, detail with map/stats), **Devices** (alias), **Maintenance** (by vehicle; receipt upload), **Settings** (units, API URL, Database: export/import/clear, clear trips only with optional tracking), **Help** (short guide, mileage explanation). Calls backend via `/api/v1` (proxy in dev or CORS).

## Tech stack

- Runtime: Node.js + TypeScript  
- HTTP: Fastify  
- DB: Prisma + PostgreSQL  
- Web UI: React + Vite + TypeScript (in `webui/`)

For protocol and data-flow details, see [PROTOCOLS.md](PROTOCOLS.md). For implementation conventions, see [DEVELOPMENT.md](DEVELOPMENT.md).
