# Architecture

Movara is an **API-only** application: **Node.js**, **TypeScript**, **Fastify**, **Prisma**, **PostgreSQL**. It uses a **modular monolith** with clear module boundaries. Do not restructure this layout; extend within it.

## Folder layout

```
src/
├── main.ts                 # Entry: Fastify app, CORS, routes, listen
├── app/                    # App-level: error handling (src/app/index.ts)
├── modules/
│   ├── tracking/           # Devices, positions, GT06 protocol
│   ├── vehicles/           # Vehicle registry, fuel records
│   ├── trips/              # Stored trips (device time range or GPX import)
│   ├── maintenance/        # Maintenance records
│   └── system/             # Backup, restore, clear-database, clear-trips
├── infrastructure/         # Cross-cutting: db, backup, config, webhooks
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
| **tracking** | Devices (IMEI + optional name), positions; GT06 TCP server, parser, protocol; persistence and device/position API. |
| **vehicles** | Vehicle registry (name, description, optional device link, photo); CRUD, fuel records (date-time, odometer, quantity, cost); trip merges (persisted gaps); list and detail API. |
| **trips** | Stored trips: create from device time range or import GPX; list, get, delete; positions and stats. |
| **maintenance** | Maintenance records (vehicle, type: service/repair/inspection/other, date, notes, odometer, cost, receipt); create/list/update/delete; list-all for overview; receipt upload and serve. |
| **system** | Backup (create, download), restore (path or upload), clear-database (wipe all), clear-trips (trips only, optional tracking). |

## Domain model (main entities)

- **Device** — id, imei, name (alias), createdAt. Lives in tracking.
- **Position** — id, deviceId, timestamp, latitude, longitude, speed?, attributes? (JSON: OsmAnd extras — accuracy, altitude, battery_level, etc.), createdAt.
- **Vehicle** — id, name, description?, deviceId?, photoPath?, createdAt.
- **FuelRecord** — id, vehicleId, date, odometer, fuelQuantity, fuelCost?, fuelRate?, latitude?, longitude?, createdAt.
- **Trip** — id, deviceId?, vehicleId?, startTime, endTime, name?, source ("device"|"imported"), createdAt; positions (TripPosition) for imported routes.
- **TripPosition** — id, tripId, latitude, longitude, timestamp, speed?, sortOrder (for imported GPX).
- **TripMerge** — id, deviceId, gapAfter, gapBefore (persisted “ignore this gap” so trips are merged).
- **MaintenanceRecord** — id, vehicleId, type (service|repair|inspection|other), notes?, odometer?, cost?, date, receiptPath?, createdAt.

## Persistence

- **Domain** defines repository interfaces (e.g. `DeviceRepository`, `PositionRepository`).
- **Infrastructure** implements them with Prisma in `src/modules/*/infrastructure/persistence/`.
- Use a single Prisma client: `getPrismaClient()` from `src/infrastructure/db`. No direct DB access from domain.

## Data flow (high level)

- **HTTP** — Request → Fastify route (module’s infrastructure/api) → shared validation (Zod) → domain/use case → repository → response.
- **GT06** — TCP (port 5051) → Gt06Server (per-socket buffer, extract full packets) → Gt06Protocol / Gt06Parser → decoded payload → ProcessIncomingPositionUseCase → repositories + events. IMEI is tracked per connection so GPS can be attributed after login.

## Web UI

- **Location:** `webui/` — React, Vite, TypeScript; minimal, no heavy UI framework. Maps via Leaflet + OpenStreetMap (direction arrows when device sends heading).
- **Role:** **Overview** (summary stats, device positions map, recent trips/maintenance), **Tracking** (time-range positions, map, stats, live refresh, GPX export), **Vehicles** (list + detail: fuel records with date-time, mileage from odometer, bar chart, maintenance), **Trips** (list stored trips, create from device range or import GPX, detail with map/stats), **Devices** (alias), **Maintenance** (by vehicle; receipt upload), **Settings** (units, API URL, Database: export/import/clear, clear trips only with optional tracking), **Help** (short guide, mileage explanation). Calls backend via `/api/v1` (proxy in dev or CORS).

## Tech stack

- Runtime: Node.js + TypeScript  
- HTTP: Fastify  
- DB: Prisma + PostgreSQL  
- Web UI: React + Vite + TypeScript (in `webui/`)

For protocol and data-flow details, see [PROTOCOLS.md](PROTOCOLS.md). For implementation conventions, see [DEVELOPMENT.md](DEVELOPMENT.md).
