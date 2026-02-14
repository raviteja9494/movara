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
| **vehicles** | Vehicle registry (name, description); CRUD and list API. |
| **maintenance** | Maintenance records (vehicle, type, date, notes, odometer); create/list by vehicle. |
| **system** | Backup and restore; API and infrastructure in `src/infrastructure/backup`. |

## Domain model (main entities)

- **Device** — id, imei, name (alias), createdAt. Lives in tracking.
- **Position** — id, deviceId, timestamp, latitude, longitude, speed?, createdAt.
- **Vehicle** — id, name, description?, createdAt.
- **MaintenanceRecord** — id, vehicleId, type, notes?, odometer?, date, createdAt.

## Persistence

- **Domain** defines repository interfaces (e.g. `DeviceRepository`, `PositionRepository`).
- **Infrastructure** implements them with Prisma in `src/modules/*/infrastructure/persistence/`.
- Use a single Prisma client: `getPrismaClient()` from `src/infrastructure/db`. No direct DB access from domain.

## Data flow (high level)

- **HTTP** — Request → Fastify route (module’s infrastructure/api) → shared validation (Zod) → domain/use case → repository → response.
- **GT06** — TCP (port 5051) → Gt06Server → Gt06Protocol / Gt06Parser → decoded payload → ProcessIncomingPositionUseCase → repositories + events. IMEI is tracked per connection so GPS can be attributed after login.

## Web UI

- **Location:** `webui/` — React, Vite, TypeScript; minimal, no heavy UI framework. Maps via Leaflet + OpenStreetMap.
- **Role:** Dashboard (latest positions + map of all devices), Vehicles, Devices (with alias), Maintenance, **Tracking** (time-range positions, map with route, odometer/speed stats, live refresh, GPX export). Calls backend via `/api/v1` (proxy in dev or CORS).

## Tech stack

- Runtime: Node.js + TypeScript  
- HTTP: Fastify  
- DB: Prisma + PostgreSQL  
- Web UI: React + Vite + TypeScript (in `webui/`)

For protocol and data-flow details, see [PROTOCOLS.md](PROTOCOLS.md). For implementation conventions, see [DEVELOPMENT.md](DEVELOPMENT.md).
