## Webhooks
**Webhooks**: Outbound webhook delivery to external services
  - Infrastructure skeleton ready
  - HTTP delivery with retry logic (pending)
  - Event subscription management (pending)
**Webhooks**: Outbound webhook delivery to external services
  - HTTP POST delivery implemented as fire-and-forget (no queues/workers)
  - Per-request timeout protection (3s) and retry policy (max 2 retries)
  - Triggered events: `position.received`, `device.online`, `device.offline`
  - Simple in-memory webhook repository provided; persistence can be added later
# Movara

[![CI](https://github.com/raviteja9494/movara/actions/workflows/ci.yml/badge.svg)](https://github.com/raviteja9494/movara/actions/workflows/ci.yml)

**Status**: Early development

Self-hosted vehicle telemetry and lifecycle platform (API-only).

## Design Goals

- **Lightweight**: Minimal resource footprint
- **Modular**: Clean separation of concerns
- **Local-first**: Designed for local network deployment
- **Extensible**: Easy to add new telemetry and lifecycle features

## CI

GitHub Actions runs on every push and pull request to `main`. The workflow uses Node.js LTS, installs dependencies, generates the Prisma client, and runs the TypeScript build. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Quick Reference

This quick reference summarizes the current, implemented capabilities and where to find them in the repository.

- **Features**:
  - GT06 TCP tracker ingestion (parser, protocol, server) with ACKs for Login and Heartbeat.
  - Position processing with lightweight deduplication (skip near-identical consecutive positions).
  - In-memory device state tracking (`lastSeen`) and dynamic online/offline computation.
  - Fire-and-forget outbound webhooks with timeout and retry protection (no queues/workers).
  - Backup and restore helpers (system module).

- **Modules** (location in `src/`):
  - `tracking`: device & position ingestion, GT06 protocol, persistence (`infrastructure/persistence`).
  - `vehicles`: vehicle registry and persistence.
  - `maintenance`: maintenance records and related use cases.
  - `system`: backup/restore utilities and system-level use cases.

- **API** (HTTP):
  - Device routes: device management and listing (`src/modules/tracking/infrastructure/api/devices.ts`).
  - Position routes: query recorded positions (`src/modules/tracking/infrastructure/api/positions.ts`).
  - Vehicle routes: CRUD/listing for vehicles (`src/modules/vehicles/infrastructure/api`).
  - Maintenance routes: create/list maintenance records (`src/modules/maintenance/infrastructure/api`).
  - System: backup and restore endpoints under `src/modules/system`.

- **GT06 support**:
  - TCP server: `src/modules/tracking/infrastructure/protocols/gt06/Gt06Server.ts` (default port 5051).
  - Parser: `src/modules/tracking/infrastructure/protocols/gt06/Gt06Parser.ts` (validates frames and performs best-effort decoding).
    - Decoded fields for GPS packets: `latitude` and `longitude` (degrees, decoded from 4-byte unsigned microdegrees), `speed` (km/h), and `timestamp` (UTC, parsed from 6-byte BCD YYMMDDhhmmss where available).
    - Parser is intentionally isolated (no DB or business logic) and returns a structured DTO in `packet.data` when decoding succeeds.
  - Protocol: `src/modules/tracking/infrastructure/protocols/gt06/Gt06Protocol.ts` (routes messages, returns ACK buffers for login & heartbeat — ACK building isolated in `Gt06Acker.ts`).
  - ACK builder: `src/modules/tracking/infrastructure/protocols/gt06/Gt06Acker.ts` (constructs GT06 response packets with checksum).

- **Data Flow**:
  - TCP bytes are accepted by `Gt06Server`, parsed by `Gt06Parser` into a structured `packet.data` DTO, and GPS payloads are forwarded to the application `ProcessIncomingPositionUseCase` for validation and persistence.
  - The protocol layer performs no database operations directly — persistence is handled inside the application use case.
  - ACKs for Login and Heartbeat are sent immediately by the protocol using `Gt06Acker`; GPS packets are processed by the use case and do not require ACKs.

### Protocol Handling

- **ACK semantics**: The protocol returns ACK packets for `login` and `heartbeat` message types. ACK packets mirror the incoming message type and follow the GT06 layout: start bytes, length, message type, optional payload, XOR checksum, end bytes. The low-level ACK creation is isolated in `src/modules/tracking/infrastructure/protocols/gt06/Gt06Acker.ts`.
- **Logging**: When ACKs are sent to trackers, the server logs a hex dump of the ACK at the `debug` level and logs a successful write at `info` level. Write failures are logged as errors.
- **No business logic**: ACK generation and sending is a transport concern; any domain-level decisions remain in application use cases.

- **Backup / Restore**:
  - System backup helpers live under `src/infrastructure/backup` and `src/modules/system` for application-level backup and restore endpoints. These utilities produce file-based backups for the database and application state.

- **Webhooks**:
  - Webhook types and dispatcher are under `src/infrastructure/webhooks`.
  - Delivery: `WebhookDispatcher` performs non-blocking HTTP POSTs with a 3s per-request timeout and up to 2 retries; an `InMemoryWebhookRepository` is included as a simple runtime store.
  - Triggered events: `position.received`, `position.recorded`, `device.online`, `device.offline` (subscribers may be HTTP webhooks or in-process listeners).


## Domain Model

### Tracking Module

**Device**: Represents a telemetry source (vehicle, tracker, etc.)
- `id`: UUID identifier
- `imei`: Unique IMEI string
- `name`: Optional device name
- `createdAt`: Registration timestamp

**Position**: GPS position record from a device
- `id`: UUID identifier
- `deviceId`: Reference to source device
- `timestamp`: When position was recorded
- `latitude`: Latitude coordinate
- `longitude`: Longitude coordinate
- `speed`: Optional speed value
- `createdAt`: When record was created

### Vehicles Module

**Vehicle**: Core vehicle registry entity
- `id`: UUID identifier
- `name`: Vehicle identifier (VIN, plate, or custom name)
- `description`: Optional vehicle details
- `createdAt`: Registration timestamp

### Maintenance Module

**MaintenanceRecord**: Vehicle maintenance tracking
- `id`: UUID identifier
- `vehicleId`: Reference to vehicle
- `type`: Maintenance type (service, fuel, repair, inspection, other)
- `notes`: Optional maintenance details
- `odometer`: Optional odometer reading
- `date`: When maintenance occurred
- `createdAt`: When record was created

## Persistence Abstraction

**Domain layer** defines repository interfaces; **infrastructure layer** implements them.

### DeviceRepository
- `findByImei(imei)`: Retrieve device by IMEI
- `create(device)`: Store new device

### PositionRepository
- `save(position)`: Store new position
- `findByDeviceId(deviceId, limit?)`: Fetch recent positions for device

### VehicleRepository
- `createVehicle(vehicle)`: Store new vehicle
- `findAllVehicles()`: Retrieve all vehicles
- `findVehicleById(id)`: Retrieve vehicle by UUID

### MaintenanceRepository
- `createRecord(record)`: Store new maintenance record
- `getRecordsByVehicle(vehicleId)`: Retrieve all records for a vehicle

**Benefit**: Domain layer is database-agnostic. Repositories can be swapped or mocked for testing.

## Application Layer

### Use Cases

**ProcessIncomingPositionUseCase**: Handle GPS position from trackers
- Input: Device ID, timestamp, latitude, longitude, optional speed
- Validates: Coordinate ranges, data types
- Output: Persisted Position entity
- Side effects:
  - Stores position in database via `PositionRepository`
  - Emits `PositionRecordedEvent` for subscribers
- Used by: GT06 protocol handler, REST API

## Repository Implementation

Prisma repositories implement domain interfaces:

**Tracking Module** (`src/modules/tracking/infrastructure/persistence/`):
- `PrismaDeviceRepository`: Maps Device entity to/from Prisma records
  - Queries: `findByImei`, `create`
- `PrismaPositionRepository`: Maps Position entity to/from Prisma records
  - Queries: `save` (insert), `findByDeviceId` (select recent, ordered by timestamp DESC)

**Vehicles Module** (`src/modules/vehicles/infrastructure/persistence/`):
- `PrismaVehicleRepository`: Maps Vehicle entity to/from Prisma records
  - Queries: `createVehicle` (insert), `findAllVehicles` (select all, ordered by createdAt DESC), `findVehicleById` (select by UUID)

**Maintenance Module** (`src/modules/maintenance/infrastructure/persistence/`):
- `PrismaMaintenanceRepository`: Maps MaintenanceRecord entity to/from Prisma records
  - Queries: `createRecord` (insert), `getRecordsByVehicle` (select by vehicleId, ordered by date DESC)

**Pattern**: Repositories handle all database logic. Domain entities remain database-agnostic.

## Domain Events

Movara includes a lightweight in-process event system for module communication.

### Overview

- **In-process only**: Events dispatched synchronously within the same application
- **Type-safe**: Full TypeScript support
- **No external dependencies**: Pure JavaScript implementation
- **Optional**: Modules can emit and subscribe to events independently

### Usage

**Define a domain event**:
```typescript
import { DomainEvent } from 'src/shared/types';

export class VehicleCreatedEvent implements DomainEvent {
  readonly eventId: string = crypto.randomUUID();
  readonly occurredAt: Date = new Date();

  constructor(
    readonly aggregateId: string, // Vehicle ID
    readonly name: string,
  ) {}
}
```

**Publish an event**:
```typescript
import { eventDispatcher } from 'src/shared/utils';

const event = new VehicleCreatedEvent(vehicleId, vehicleName);
await eventDispatcher.dispatch('vehicle.created', event);
```

**Subscribe to events**:
```typescript
import { eventDispatcher } from 'src/shared/utils';
import { VehicleCreatedEvent } from './VehicleCreatedEvent';

eventDispatcher.subscribe('vehicle.created', async (event: VehicleCreatedEvent) => {
  console.log(`Vehicle created: ${event.name}`);
  // React to event - log, update cache, etc.
});
```

### Benefits

- **Decoupling**: Modules react to domain events without direct dependencies
- **Testability**: Handlers can be independently tested
- **Consistency**: Centralized event handling across modules

## Validation Strategy

Movara uses **Zod** for lightweight schema validation, keeping controllers thin and validation logic decoupled.

### Overview

- **No heavy frameworks**: Zod only (no class-validator, yup, joi)
- **Shared layer**: Validation lives in `src/shared/validation/`
- **Type-safe**: Full TypeScript support with inferred types
- **Reusable**: Schemas can be used anywhere (controllers, use cases, tests)
- **Consistent errors**: Structured validation error responses

### Validation Layer

**Schemas** (`src/shared/validation/schemas.ts`):
```typescript
import { CreateVehicleSchema, CreateMaintenanceSchema } from 'src/shared/validation';

// Schemas are Zod objects with inferred TypeScript types
const vehicleData = validate(request.body, CreateVehicleSchema);
// vehicleData is typed as CreateVehicleRequest
```

**Validation Utilities** (`src/shared/validation/validation.ts`):
- `validate(data, schema)`: Throws `ValidationError` on failure
- `validateSafe(data, schema)`: Returns `{ success, data }` or `{ success, error }`
- `ValidationError`: Provides `getFieldErrors()` for structured responses

### Usage in Controllers

**Thin controllers** delegate validation to shared layer:

```typescript
// Before: Manual validation in controller
app.post('/api/v1/vehicles', async (request, reply) => {
  if (!name || name.trim().length === 0) {
    return reply.status(400).send({ error: 'name is required' });
  }
  // ... more manual checks
});

// After: Validation in shared layer
app.post('/api/v1/vehicles', async (request, reply) => {
  try {
    const validated = validate(request.body, CreateVehicleSchema);
    // validated has type CreateVehicleRequest
    const vehicle = Vehicle.create(validated.name, validated.description);
    type: 'login',
    length: 13,
    messageType: 0x01,
    payload: [0x09, 0x23, 0x45, ...],
    checksum: 0x0D,
    valid: true,
    data: {
      imei: '8675309...'
});
```

  **Data Flow**: The parser now performs lightweight decoding (IMEI, coordinates, timestamp, speed) and `Gt06Protocol` consumes the decoded DTO. Device authentication and persistence are intentionally kept out of the parser/protocol for now — decoded DTOs are logged and will be persisted only after authentication is implemented.

## GT06 Protocol Handling

- **ACKs for login & heartbeat**: The GT06 protocol handler (`Gt06Protocol`) returns ACK response buffers for tracker Login and Heartbeat message types. The TCP server (`Gt06Server`) writes the returned ACK buffer back to the socket when present.
- **Isolated ACK builder**: ACK packet construction is implemented in `src/modules/tracking/infrastructure/protocols/gt06/Gt06Acker.ts`. This keeps packet formatting separate from protocol routing and business logic.
- **No business logic in protocol**: `Gt06Protocol` and `Gt06Parser` perform decoding, validation, and routing only. Device authentication and persistence remain in application/infrastructure layers and are intentionally excluded from the protocol code.
- **ACK format**: ACKs follow the GT06 response layout (start bytes, length, message type, optional payload, checksum, end bytes). The XOR checksum is calculated over the length + body as implemented in the ACK builder.

This design ensures the server can promptly acknowledge tracker messages while keeping domain concerns (authentication, storage) separate and testable.

## Data Integrity

- **Position deduplication**: To avoid storing identical consecutive GPS records, Movara performs lightweight deduplication before persisting incoming positions. The `ProcessIncomingPositionUseCase` checks the most recent position for the device and skips saving when the new position is effectively identical.
- **Comparison criteria**: Movara compares latitude, longitude, and timestamp deltas. Default thresholds used in the implementation:
  - Latitude/Longitude delta: <= 1e-5 degrees (~1.1 meter)
  - Timestamp delta: <= 5000 ms (5 seconds)
- **Behavior**: If the new reading falls within these thresholds relative to the last recorded position for the same device, the system will not create a new database record and will return the existing position. No domain event is emitted for deduplicated positions.
- **Rationale**: This keeps storage efficient for noisy or frequent tracker updates while remaining simple and deterministic. Thresholds are conservative and can be adjusted later if tighter or looser deduplication is desired.

## Device State

- **lastSeen tracking**: Movara maintains an in-memory `lastSeen` timestamp per device when messages or positions are received. This is updated by the GT06 protocol handler and by position processing.
- **Status computation**: Device online/offline status is computed dynamically from `lastSeen`. By default a device is considered `online` if it was seen within the last 2 minutes (120000 ms); otherwise it is `offline`.
- **No background jobs**: Status is computed on-demand (no background workers or schedulers). This keeps the system simple while providing a reasonable approximation of device availability.
- **Events**: `device.online` is emitted when a device communicates (login/heartbeat/GPS) and `device.offline` is emitted when a connection is closed. Consumers can subscribe to these events or query the `DeviceStateStore`.

## Device Lifecycle

- **Automatic registration**: When an incoming GT06 message contains an IMEI not found in the system, Movara will automatically create a `Device` record. Registration logic lives in the application layer (`ProcessIncomingPositionUseCase`) and uses the `DeviceRepository` abstraction; the parser and protocol layers remain free of DB logic.
- **Identifier mapping**: The GT06 parser decodes IMEI values; the application layer maps IMEI → internal `Device.id` and stores positions against the internal identifier.
- **Customization**: Automatic registration is conservative — default behavior creates a minimal `Device` record with `imei` and `createdAt`. You can extend registration to add metadata or require manual approval by modifying the use case or repository implementations.

Movara returns a consistent JSON error envelope for all errors:

```json
{
  "error": true,
  "message": "...",
  "code": "..."
}
```

Common `code` values:

- `VALIDATION_ERROR` — Request body or query validation failed
- `NOT_FOUND` — Resource not found
- `CONFLICT` — Resource conflict (duplicate, invalid state)
- `UNAUTHORIZED` / `FORBIDDEN` — Authentication/authorization issues
- `DOMAIN_ERROR` — Business rule violation
- `INTERNAL_ERROR` — Unexpected server error

Validation errors include a `fields` object with field-level messages:

```json
{
  "error": true,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "fields": {
    "name": ["name is required and must not be empty"],
    "type": ["Invalid enum value. Expected 'service' | 'fuel' | 'repair' | 'inspection' | 'other'"],
    "date": ["Expected valid ISO 8601 datetime"]
  }
}
```

### Covered Endpoints

- `POST /api/v1/vehicles` - Name required, max 255 chars; description max 1000 chars
- `POST /api/v1/maintenance` - vehicleId (UUID), type (enum), date (ISO 8601), optional notes and odometer
- `POST /api/v1/system/backup` - Optional backupDir (defaults to './backups')
- `POST /api/v1/system/restore` - backupPath required

## Pagination

Movara implements lightweight pagination for list endpoints.

### Overview

- **Query parameters**: `page` (1-indexed), `limit` (items per page)
- **Sensible defaults**: page=1, limit=10
- **Constraints**: limit capped at 100
- **Metadata included**: total, page, limit, pages, hasNextPage, hasPreviousPage
- **Lightweight**: No pagination library, utilities in `src/shared/utils/pagination.ts`

### Usage

All GET list endpoints support pagination:

```bash
# Default pagination (page=1, limit=10)
curl http://localhost:3000/api/v1/vehicles

# Custom pagination
curl "http://localhost:3000/api/v1/vehicles?page=2&limit=20"

# Get page 3 with 50 items per page
curl "http://localhost:3000/api/v1/devices?page=3&limit=50"
```

### Response Format

Paginated responses include metadata alongside data:

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Vehicle 1",
      "description": "Company vehicle",
      "createdAt": "2026-02-11T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "pages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Covered Endpoints

- `GET /api/v1/vehicles` - List all vehicles (paginated)
- `GET /api/v1/devices` - List all devices (paginated)
- `GET /api/v1/maintenance/:vehicleId` - List maintenance records for vehicle (paginated)

## Architecture

Movara uses a **modular monolith** architecture with clear separation of concerns:

```
src/
├── main.ts                          # Application entry point
  - Device authentication/login packet handling (pending)
  - Response packet building (pending)
│   │   ├── domain/                  # Business logic
│   │   │   ├── entities/
│   │   │   ├── value-objects/
│   │   │   └── repositories/
│   │   ├── application/             # Use cases & DTOs
│   │   │   ├── use-cases/
│   │   │   └── dto/
│   │   └── infrastructure/          # Persistence & API
│   │       ├── persistence/
│   │       └── api/
│   ├── vehicles/                    # Vehicle registry
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── maintenance/                 # Maintenance tracking
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   └── system/                      # System & backup
│       ├── domain/
│       ├── application/
│       └── infrastructure/
├── infrastructure/                  # Cross-cutting concerns
│   ├── db/                          # Database initialization
│   ├── backup/                      # Backup & restore
│   └── config/                      # Configuration
└── shared/                          # Shared code
    ├── types/                       # Type definitions
    └── utils/                       # Utility functions
```

Each module follows **Domain-Driven Design** (DDD):
- **Domain**: Core business logic, entities, value objects, repository interfaces
- **Application**: Use cases, DTOs, orchestration
- **Infrastructure**: Data persistence, API adapters, external integrations

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Fastify
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Architecture**: Modular monolith
- **Web UI**: React + Vite + TypeScript (minimal, in `webui/`)

## Logging

Movara uses `pino` via Fastify's built-in logger for lightweight structured logging. The default configuration logs to stdout and is suitable for local deployments.

What's logged:

- **Server lifecycle**: startup and shutdown messages
- **Errors**: all errors are logged by the global error handler
- **GT06 connections**: connection, disconnection, data received, and protocol errors at `debug`/`info` levels

Configuration:

Environment variables:

```
LOG_LEVEL=info   # default: info (use debug for more verbose GT06 logs)
NODE_ENV=development  # enables pretty-printed logs
```

The Fastify instance is configured in `src/main.ts` to use the `pino` logger exposed as `app.log`.


## Prerequisites

- Node.js 18+
- PostgreSQL 12+

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment (optional, defaults work for local dev):
   ```bash
   cp .env.example .env
   ```

3. Initialize database:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000` (configurable via `PORT` env var).

## Web UI

A minimal React frontend lives in `webui/` (Vite + TypeScript, no heavy UI framework).

- **Run the UI**: From the repo root, `cd webui && npm install && npm run dev`. The app is served at `http://localhost:5173`.
- **API proxy**: In dev, Vite proxies `/api` and `/health` to `http://localhost:3000`, so start the Movara API first when using the UI.
- **Build**: `cd webui && npm run build` produces static assets in `webui/dist/`. Use `npm run preview` to serve the build locally.

## Running with Docker

Movara runs in Docker with PostgreSQL.

### Quick Start

```bash
# Start both app and database
docker-compose up

# Migrate database (first time only)
docker-compose exec app npx prisma migrate deploy

# Stop
docker-compose down
```

### Configuration

Environment variables in `docker-compose.yml`:
- `NODE_ENV`: production/development
- `PORT`: application port (default 3000)
- `DB_USER`: PostgreSQL username (default movara)
- `DB_PASSWORD`: PostgreSQL password (default movara)
- `DB_NAME`: Database name (default movara)
- `DB_PORT`: PostgreSQL port (default 5432)

**Override via environment**:
```bash
PORT=4000 DB_PASSWORD=secret docker-compose up
```

Or create `.env` file:
```bash
cp .env.docker .env
# Edit .env with your values
docker-compose up
```

### Backup in Docker

```bash
# Create backup
curl -X POST http://localhost:3000/api/v1/system/backup \
  -H "Content-Type: application/json" \
  -d '{"backupDir": "/app/backups"}'

# Backups stored in ./backups (mounted volume)
```

## Database

Movara uses PostgreSQL with Prisma ORM.

**Required**: PostgreSQL 12+ running locally or on your network.

**Connection**: Set `DATABASE_URL` in `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/movara
```

**Schema**: Auto-migrated via Prisma. Models:
- `Device` - Vehicle/tracker with IMEI identifier
- `Position` - GPS positions with timestamp, lat/lon, optional speed
- `Vehicle` - Vehicle registry with name and description
- `MaintenanceRecord` - Maintenance history with type, date, and odometer

**Initialize**: Run migrations to create schema:
```bash
npm run prisma:migrate
```

**Inspect**: View database with Prisma Studio:
```bash
npm run prisma:studio
```

### DB Access Rules

- **Singleton pattern**: Use `getPrismaClient()` from `src/infrastructure/db`
- **One instance**: Never instantiate multiple Prisma clients
- **Graceful shutdown**: Automatic on SIGINT/SIGTERM
- **Domain layer**: Does not access database directly; uses repository interfaces
- **Infrastructure layer**: Implements repositories using Prisma client
- **Query logging**: Enabled in development, errors only in production

## Health Endpoint

Test the server:
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok"
}
```

## API v1

All endpoints return JSON. Currently no authentication required.

### Devices

**GET /api/v1/devices**

List all devices with pagination.

**Query Parameters**:
- `page` (optional): Page number (default 1, must be >= 1)
- `limit` (optional): Items per page (default 10, max 100)

Example: `GET /api/v1/devices?page=1&limit=20`

Response:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "imei": "123456789012345",
      "name": "Vehicle 1",
      "createdAt": "2026-02-11T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "pages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Positions

**GET /api/v1/positions/latest**

Fetch latest positions for a device, ordered by timestamp (newest first).

**Query Parameters**:
- `deviceId` (required): UUID of the device
- `limit` (optional): Number of records (default 10, max 100)

Example: `GET /api/v1/positions/latest?deviceId=<uuid>&limit=20`

Response:
```json
{
  "positions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "deviceId": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2026-02-11T10:29:00Z",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "speed": 45.5,
      "createdAt": "2026-02-11T10:30:00Z"
    }
  ]
}
```

### Vehicles

**GET /api/v1/vehicles**

List all vehicles with pagination.

**Query Parameters**:
- `page` (optional): Page number (default 1, must be >= 1)
- `limit` (optional): Items per page (default 10, max 100)

Example: `GET /api/v1/vehicles?page=1&limit=20`

Response:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "Tesla Model 3",
      "description": "Company vehicle",
      "createdAt": "2026-02-11T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "pages": 2,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**POST /api/v1/vehicles**

Create a new vehicle.

**Request**:
```json
{
  "name": "Tesla Model 3",
  "description": "Company vehicle"
}
```

**Response** (201 Created):
```json
{
  "vehicle": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "name": "Tesla Model 3",
    "description": "Company vehicle",
    "createdAt": "2026-02-11T10:30:00Z"
  }
}
```

**Validation**:
- `name` is required and must not be empty

### Maintenance

**GET /api/v1/maintenance/:vehicleId**

Fetch maintenance records for a vehicle with pagination.

**Path Parameters**:
- `vehicleId` (required): UUID of the vehicle

**Query Parameters**:
- `page` (optional): Page number (default 1, must be >= 1)
- `limit` (optional): Items per page (default 10, max 100)

Example: `GET /api/v1/maintenance/550e8400-e29b-41d4-a716-446655440002?page=1&limit=20`

Response:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "vehicleId": "550e8400-e29b-41d4-a716-446655440002",
      "type": "service",
      "notes": "Oil change and filter replacement",
      "odometer": 45000,
      "date": "2026-02-10T10:00:00Z",
      "createdAt": "2026-02-11T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 8,
    "page": 1,
    "limit": 20,
    "pages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

**POST /api/v1/maintenance**

Create a new maintenance record.

**Request**:
```json
{
  "vehicleId": "550e8400-e29b-41d4-a716-446655440002",
  "type": "service",
  "date": "2026-02-10T10:00:00Z",
  "notes": "Oil change and filter replacement",
  "odometer": 45000
}
```

**Response** (201 Created):
```json
{
  "record": {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "vehicleId": "550e8400-e29b-41d4-a716-446655440002",
    "type": "service",
    "notes": "Oil change and filter replacement",
    "odometer": 45000,
    "date": "2026-02-10T10:00:00Z",
    "createdAt": "2026-02-11T10:30:00Z"
  }
}
```

**Validation**:
- `vehicleId`, `type`, and `date` are required
- `type` must be one of: service, fuel, repair, inspection, other
- `notes` and `odometer` are optional

## Backup & Restore

Movara supports manual backup and restore operations for disaster recovery.

### Backup

Creates a point-in-time backup including database dump and metadata.

**Function**: `createBackup(backupDir)` → returns backup path

**Backup structure**:
```
backup-2026-02-11T10-30-00-123Z/
├── metadata.json          # Backup timestamp, version, database name
└── db.sql.gz              # Compressed PostgreSQL dump
```

**Usage**:
```typescript
import { createBackup } from 'src/infrastructure/backup';
const backupPath = await createBackup('./backups');
```

### Restore

Restores database from backup. **Blocks application during restore.**

**Function**: `restoreBackup(backupPath)` → void (async)

**Process**:
1. Decompress backup dump
2. Drop existing database
3. Create fresh database
4. Restore from dump
5. Restart app to reconnect

**Usage**:
```typescript
import { restoreBackup } from 'src/infrastructure/backup';
await restoreBackup('./backups/backup-2026-02-11T10-30-00-123Z');
// Restart application after restore
```

**Requirements**:
- PostgreSQL client tools (`pg_dump`, `psql`) on system PATH
- Database credentials in `DATABASE_URL`

## System API

System endpoints manage backup and restore operations.

### Backup

**POST /api/v1/system/backup**

Create a database backup.

**Request**:
```json
{
  "backupDir": "./backups"
}
```

**Response** (201 Created):
```json
{
  "status": "success",
  "backup": {
    "path": "./backups/backup-2026-02-11T10-30-00-123Z",
    "timestamp": "2026-02-11T10:30:00.123Z"
  }
}
```

### Restore

**POST /api/v1/system/restore**

Restore database from a backup. **Requires application restart after restore.**

**Request**:
```json
{
  "backupPath": "./backups/backup-2026-02-11T10-30-00-123Z"
}
```

**Response** (200 OK):
```json
{
  "status": "success",
  "restore": {
    "status": "restored"
  }
}
```

**Note**: Application will disconnect from database after restore. Restart required to reconnect.

## Protocols

### GT06 (GPS Tracker)

**TCP Server**: Accepts binary GPS tracker data on port 5051

- Listens for GT06-compatible device connections
- Full connection lifecycle management (connect, send, disconnect)
- Logs all incoming packets in HEX format

**Packet Structure** (validated by parser):
```
[Sync:2] [Length:2] [Type:1] [Payload:*] [Checksum:1] [End:2]
 0x78 78   (big-endian)  (0x01/0x12/0x13)          (XOR)      0x0D 0x0A
```

**Supported Message Types**:
- `0x01` - Login (device registration)
- `0x12` - GPS location report
- `0x13` - Heartbeat

**Parser Features**:
- Validates sync bytes, end bytes, packet length
- Calculates and verifies XOR checksum
- Returns structured `Gt06Packet` DTO with:
  - `type`: Detected packet type (login/gps/heartbeat/unknown)
  - `messageType`: Raw message type byte
  - `payload`: Message payload bytes
  - `valid`: Checksum validation result
  - `error`: Validation error if invalid

**Example**: A device sends:
```
78 78 00 0D 01 09 23 45 67 89 01 23 45 67 89 00 01 02 03 04 05 06 0D 0A
└─┘ └────┘ └──────────────────────────────────────────┘ └──┘ └────┘
sync length      LOGIN PAYLOAD (13 bytes)                check end
```
Parser returns:
```
{
  type: 'login',
  length: 13,
  messageType: 0x01,
  payload: [0x09, 0x23, 0x45, ...],
  checksum: 0x0D,
  valid: true
}
```

**Data Flow**: Connected to `ProcessIncomingPositionUseCase` for end-to-end GPS ingestion. Payload decoders (IMEI, coordinates, speed, timestamp) pending implementation.

**Status**: TCP server and packet parser complete. Protocol handler connected to use cases. Payload decoding in development.

## Data Flow

### Incoming GPS Position (GT06 Protocol)

```
Device (GT06 Tracker)
    ↓
[TCP Connection] (port 5051)
    ↓
Gt06Server
  - Socket lifecycle
  - Accepts raw bytes
  - Logs HEX for debugging
    ↓
Gt06Protocol.handleMessage()
  - Parses packet structure
  - Routes by message type
    ↓
Gt06Parser
  - Validates sync/end bytes
  - Checks XOR checksum
  - Extracts payload
    ↓
Gt06Protocol.handleGps()
  - Decodes payload
  - Extracts: IMEI, lat/lon, speed, timestamp
    ↓
ProcessIncomingPositionUseCase
  - Validates coordinates & data types
  - Creates Position entity
  - Stores via PositionRepository
    ↓
PositionRecordedEvent
  - Domain event dispatched
  - Subscribers notified (webhooks, logging, etc.)
    ↓
Database + Event Handlers
```

**Key Design Principles**:
- **TCP layer**: Socket I/O only, no business logic
- **Parser**: Structure validation, no interpretation
- **Protocol**: Routes to appropriate handlers
- **Use Case**: Business logic, validation, persistence
- **Repository**: Data access, database-agnostic
- **Events**: Module decoupling via domain events

**Separation of Concerns**:
- TCP (`Gt06Server`): Connection lifecycle
- Protocol (`Gt06Protocol`): Message routing and parsing
- Application (`ProcessIncomingPositionUseCase`): Business rules
- Infrastructure (`PositionRepository`): Data persistence

## Development Setup

### ✅ Implemented

- **Tracking module**: Device and Position entities, repositories, and read-only API
- **Vehicles module**: Vehicle entity, repository, and CRUD API
- **Maintenance module**: MaintenanceRecord entity, repository, and CRUD API
- **System module**: Backup and restore functionality with API endpoints
- **Database**: PostgreSQL schema with Prisma ORM
- **Docker**: Multi-container setup with app and database
- **Domain Events**: In-process event system for module communication
- **Validation**: Zod-based schema validation in shared layer for all write endpoints
- **Pagination**: Lightweight pagination for GET endpoints (vehicles, devices, maintenance)
- **Architecture**: Modular monolith with DDD principles

### Planned

- **GT06 Protocol**: Complete GT06 GPS tracker support
  - Payload decoders: IMEI extraction, coordinate decoding, timestamp parsing (pending)
  - Device authentication/login packet handling (pending)
  - Response packet building (pending)
- **Webhooks**: Outbound webhook delivery to external services
  - Infrastructure skeleton ready
  - HTTP delivery with retry logic (pending)
  - Event subscription management (pending)
- **Device Write Endpoints**: Create/update device data via API
- **Authentication**: API key or JWT-based auth for API endpoints
- **Querying**: Advanced filters and date ranges for position queries

## Available Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production build
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (interactive database viewer)

## License

MIT
