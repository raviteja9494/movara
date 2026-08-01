# Development guide

Conventions and implementation details for working on Movara. See [ARCHITECTURE.md](ARCHITECTURE.md) for structure and [API.md](API.md) for HTTP contracts.

## Validation (Zod)

- **Shared layer**: `src/shared/validation/` — schemas and `validate()` / `validateSafe()`.
- **Thin controllers**: Controllers validate with shared schemas and pass typed data to use cases.
- **Query params**: Use `z.coerce.number()` for `page` and `limit` so string query params are coerced correctly.

**Example (controller)**:

```typescript
import { validate, CreateVehicleSchema } from 'src/shared/validation';

app.post('/api/v1/vehicles', async (request, reply) => {
  const validated = validate(request.body, CreateVehicleSchema);
  const vehicle = Vehicle.create(validated.name, validated.description);
  // ...
});
```

**ValidationError**: Provides `getFieldErrors()` for structured API responses. Common codes: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `DOMAIN_ERROR`, `INTERNAL_ERROR`.

## Domain events

- **In-process only**: Synchronous dispatch within the same app; no message queue.
- **Define**: Implement `DomainEvent` (e.g. `eventId`, `occurredAt`, aggregateId).
- **Publish**: `eventDispatcher.dispatch('event.name', event)` from `src/shared/utils`.
- **Subscribe**: `eventDispatcher.subscribe('event.name', handler)`.

Used for: `position.recorded`, `device.online`, `device.offline`, `vehicle.created`, etc. Webhooks subscribe to these events.

## Database rules

- **Composition root**: `src/composition-root.ts` owns one Prisma instance and injects it explicitly.
- **Domain**: No direct DB access; use repository interfaces.
- **Infrastructure**: Implement repositories with Prisma in each module’s `infrastructure/persistence/`.
- **Injection**: Persistence adapters receive `PrismaClient` in their constructors; only the composition root creates and wires the client.

## Logging

- **Logger**: Fastify’s `pino` via `app.log`. No separate logger instance.
- **Levels**: `LOG_LEVEL=info` (default); use `debug` for verbose GT06 traffic.
- **Scope**: Server lifecycle, errors (global handler), GT06 connections and protocol errors.

## Device state

- **lastSeen and status**: Stored on the device in PostgreSQL and updated when messages or positions are received (protocol handlers + position use case).
- **Online/offline**: Computed on-demand from `lastSeen` (e.g. online if seen within last 2 minutes). No background jobs.
- **Events**: `device.online` when device communicates; `device.offline` when connection closes.

## Webhooks

The unused in-memory webhook subsystem was removed. No webhook routes or outgoing delivery behavior are currently exposed.

## Position deduplication

- **Where**: `ProcessIncomingPositionUseCase`. Before saving, compare with latest position for the device.
- **Skip when**: Latitude/longitude delta ≤ ~1e-5 degrees and timestamp delta ≤ 5s. No new record and no event for deduplicated positions.

## Device lifecycle

- **Provisioning and ownership**: Trackers must be provisioned through authenticated `POST /api/v1/devices` before they connect. Unknown IMEIs are rejected because protocol traffic has no user identity from which secure ownership can be inferred.
- **Tenancy**: Accounts are isolated tenants. `ALLOW_REGISTRATION=true` permits additional isolated accounts; it does not add shared household administrators.
- **Instance operations**: `/api/v1/system/*` routes require the separate `X-Movara-Admin-Token` operator credential in addition to a user JWT.
- **IMEI per connection**: GT06 protocol stores IMEI per connection after login; GPS handler uses it when payload has no IMEI.

## Error envelope

All API errors use a consistent JSON shape:

```json
{
  "error": true,
  "message": "...",
  "code": "VALIDATION_ERROR"
}
```

Validation errors include `fields`: `{ "fieldName": ["message"] }`.

## Pagination

- **Params**: `page` (1-based), `limit` (capped at 100). Defaults: page=1, limit=10.
- **Helpers**: `src/shared/utils/pagination.ts` — `getOffset()`, `createPaginatedResponse()`.
- **Response**: `data` array plus `pagination`: `total`, `page`, `limit`, `pages`, `hasNextPage`, `hasPreviousPage`.

## CI and local verification

Run the same backend checks as CI from the repository root:

```bash
npm ci
npx prisma validate
npx prisma generate
npm run build
npm run test:integration
```

The integration suite starts disposable PostgreSQL with Docker Compose, deploys every migration, performs actual HTTP requests, and tears the database down afterward. Docker with Compose support must be available. Build the Web UI separately with `cd webui && npm ci && npm run build`.

The GitHub Actions CI workflow runs on pushes and pull requests for `main`, as well as manual dispatch. Release tags reuse the same verification before artifacts or container images are published.

## GT06 protocol (summary)

- **ACKs**: Login and heartbeat get ACK responses; built in `Gt06Acker.ts`. No business logic in protocol.
- **Parser**: Validates sync/end bytes and XOR checksum; returns structured DTO. See [PROTOCOLS.md](PROTOCOLS.md).
