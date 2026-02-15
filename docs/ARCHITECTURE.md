# Architecture

Movara is an **API-only** application: **Node.js**, **TypeScript**, **Fastify**, **Prisma**, **PostgreSQL**. It uses a **modular monolith** with clear module boundaries. Do not restructure this layout; extend within it.

## Folder layout

```
src/
├── main.ts                 # Entry: Fastify app, CORS, routes, listen
├── app/                    # App-level: error handling (src/app/index.ts)
├── modules/
│   ├── tracking/           # Devices, positions, GT06 protocol
│   ├── vehicles/           # Vehicle registry
│   ├── maintenance/        # Maintenance records
│   └── system/             # Backup/restore
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
| **vehicles** | Vehicle registry (name, description, optional device link, photo); CRUD, fuel records, trips (from device positions), trip merges (persisted gaps to treat segments as one trip); list and detail API. |
| **maintenance** | Maintenance records (vehicle, type, date, notes, odometer, cost, receipt); create/list/update/delete by vehicle; receipt upload and serve. |
| **system** | Backup and restore; API and infrastructure in `src/infrastructure/backup`. |

## Domain model (main entities)

- **Device** — id, imei, name (alias), createdAt. Lives in tracking.
- **Position** — id, deviceId, timestamp, latitude, longitude, speed?, attributes? (JSON: OsmAnd extras — accuracy, altitude, battery_level, etc.), createdAt.
- **Vehicle** — id, name, description?, deviceId?, photoPath?, createdAt.
- **FuelRecord** — id, vehicleId, date, odometer, fuelQuantity, fuelCost?, fuelRate?, latitude?, longitude?, createdAt.
- **TripMerge** — id, deviceId, gapAfter, gapBefore (persisted “ignore this gap” so trips are merged).
- **MaintenanceRecord** — id, vehicleId, type, notes?, odometer?, cost?, date, receiptPath?, createdAt.

## Persistence

- **Domain** defines repository interfaces (e.g. `DeviceRepository`, `PositionRepository`).
- **Infrastructure** implements them with Prisma in `src/modules/*/infrastructure/persistence/`.
- Use a single Prisma client: `getPrismaClient()` from `src/infrastructure/db`. No direct DB access from domain.

## Data flow (high level)

- **HTTP** — Request → Fastify route (module’s infrastructure/api) → shared validation (Zod) → domain/use case → repository → response.
- **GT06** — TCP (port 5051) → Gt06Server (per-socket buffer, extract full packets) → Gt06Protocol / Gt06Parser → decoded payload → ProcessIncomingPositionUseCase → repositories + events. IMEI is tracked per connection so GPS can be attributed after login.

## Web UI

- **Location:** `webui/` — React, Vite, TypeScript; minimal, no heavy UI framework. Maps via Leaflet + OpenStreetMap.
- **Role:** Dashboard (latest positions + map of all devices), Vehicles (list + detail with fuel chart, fuel table, location records), Vehicle **trip detail** (map, location records, stats, merge/split/add stops, export GPX, rename), Devices (with alias), Maintenance (with cost, receipt upload), **Tracking** (time-range positions, map with route, odometer/speed stats, live refresh, GPX export; URL params for device/from/to for deep links). Calls backend via `/api/v1` (proxy in dev or CORS).

## Tech stack

- Runtime: Node.js + TypeScript  
- HTTP: Fastify  
- DB: Prisma + PostgreSQL  
- Web UI: React + Vite + TypeScript (in `webui/`)

For protocol and data-flow details, see [PROTOCOLS.md](PROTOCOLS.md). For implementation conventions, see [DEVELOPMENT.md](DEVELOPMENT.md).
