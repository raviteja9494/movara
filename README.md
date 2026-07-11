# Movara

[![CI](https://github.com/raviteja9494/movara/actions/workflows/ci.yml/badge.svg)](https://github.com/raviteja9494/movara/actions/workflows/ci.yml)

**Self-hosted vehicle telemetry and lifecycle platform.** Node.js, TypeScript, Fastify, Prisma, PostgreSQL. Modular monolith with a React Web UI in `webui/` (maps via Leaflet, fast tracker history, vehicles with fuel records and mileage, trips from device, ignition, or GPX import, maintenance with cost and receipts, Help, Settings with DB export/import/clear and clear-trips-only, Raw log for protocol debugging).

**This project was written entirely by AI** (Cursor/Claude). Use and extend as you like.

**For humans and agents:** Start here. For architecture, development conventions, API reference, and protocols, see **[docs/](docs/)** — in particular [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and [docs/RELEASE.md](docs/RELEASE.md) for release and production deployment.

**Tracking from your phone:** You can use **[Traccar Client](https://www.traccar.org/client/)** (Android / iOS) as a tracking device: install the app, create a device in Movara (Devices), then in the app set the server to your Movara URL with port **5055** (OsmAnd protocol). Link the device to a vehicle in Movara to see trips and position on the map. Buffered uploads keep the original record time when they arrive later, and obviously future timestamps are clamped for safety. See [docs/PROTOCOLS.md](docs/PROTOCOLS.md) for details.

**GT06 / OBD devices:** GT06 trackers are supported on port **5023**. Optional telemetry such as ignition and battery-related status is normalized into `Position.attributes`, so the same device can drive live tracking and, when linked to a vehicle, automatic ignition-based trip creation without adding new telemetry columns up front.

**Eelink / G500M devices:** Eelink-family trackers such as some `G500M` OBD units use the Movara listener on **5064** over plain TCP.

**Logs:** Movara writes daily protocol logs by default under `./protocol-logs` (or `PROTOCOL_DEBUG_DIR` if set), keeps the newest 4 files per log type, and exposes them in the **Logs** page in the Web UI. You can still disable protocol logging at runtime from Settings.

---

## Prerequisites

- Node.js 18+
- PostgreSQL 12+

## Quick start (npm)

1. **Install and configure**
   ```bash
   npm install
   cp .env.example .env   # optional; set DATABASE_URL if needed
   ```

2. **Database**
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

3. **Run API**
   ```bash
   npm run dev
   ```
   API: **http://localhost:3000** — try `curl http://localhost:3000/health`

4. **Web UI (optional)**  
   In another terminal:
   ```bash
   cd webui && npm install && npm run dev
   ```
   UI: **http://localhost:5173** — in dev it proxies `/api` and `/health` to the API.

## Dev: PostgreSQL in Docker only

If you run **only the database** in Docker and the app + webui locally (e.g. `npm run dev`):

1. Start Postgres:
   ```bash
   docker compose up -d db
   ```
2. In `.env` set `DATABASE_URL=postgresql://movara:movara@localhost:5432/movara` (or match your `DB_USER`/`DB_PASSWORD`).
3. Run `npm run prisma:migrate` and `npm run dev` (and `cd webui && npm run dev` for the UI).

**Settings → Export database** needs `pg_dump`. If it’s not installed on the host, the app will try to run it via Docker (a temporary `postgres:16-alpine` container). So with **Docker Desktop running**, export works without installing PostgreSQL on the host.

## Quick start (Docker, local build)

```bash
cp .env.release.example .env   # set DB_PASSWORD and JWT_SECRET before starting
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

- **Web UI**: http://localhost:8080 (or your `WEBUI_PORT`)
- **API**: http://localhost:3000 (or your `PORT`; UI proxies `/api` and `/health` to backend)
- Uses [docker-compose.yml](docker-compose.yml) (builds images locally). For production pull-only deploy, see **Deploy with Docker (production)** below.

## Deploy with Docker (production, pull-only)

For a 24/7 server (e.g. Proxmox LXC): **download two files, set `.env`, pull and run** — no local build.

1. **Download** into a folder (e.g. `movara`):
   - [docker-compose.release.yml](docker-compose.release.yml)
   - [.env.release.example](.env.release.example) → save as **`.env`**

2. **Edit `.env`**: set at least `DB_PASSWORD` and `JWT_SECRET`. Generate `JWT_SECRET` with `openssl rand -hex 32`. Optionally set port variables if the defaults are in use (see **Changing ports** below).

3. **Pull and start**:
   ```bash
   docker compose -f docker-compose.release.yml pull
   docker compose -f docker-compose.release.yml up -d
   docker compose -f docker-compose.release.yml exec app npx prisma migrate deploy
   ```

4. **Open** http://YOUR_SERVER:8080 (or your `WEBUI_PORT`).

Pre-built images are published to GitHub Container Registry on each [release](https://github.com/raviteja9494/movara/releases). Full details: **[docs/RELEASE.md](docs/RELEASE.md)**.

### Changing ports (Docker / Docker Compose)

If the default ports are already in use, set these in your **`.env`** (create it from [.env.release.example](.env.release.example)). Both **docker-compose.yml** and **docker-compose.release.yml** read from `.env`.

| Variable      | Default | Meaning |
|---------------|---------|--------|
| `PORT`        | 3000    | Host port for the **API** (e.g. `http://server:PORT`) |
| `WEBUI_PORT`  | 8080    | Host port for the **Web UI** (browser). Use this for the URL you open. |
| `DB_PORT`     | 5432    | Host port for **PostgreSQL** (e.g. for external DB tools). |
| `JWT_SECRET`  | required | Production signing secret for login tokens. Use a unique value of at least 32 characters. |
| `ALLOW_REGISTRATION` | false | First user can always register. Set `true` only temporarily if you intentionally want open registration for additional users. |
| `GT06_PORT`   | 5023    | Host port for **GT06 tracker** protocol (release compose only). |
| `EELINK_PORT` | 5064    | Host port for the **Eelink / G500M tracker** listener. |
| `OSMAND_PORT` | 5055    | Host port for **OsmAnd / Traccar Client** (release compose only). |
| `PROTOCOL_DEBUG` | true | Enable persistent protocol debug `.jsonl` files. |
| `PROTOCOL_DEBUG_DIR` | `./protocol-logs` | Directory for protocol debug files. |

**Example:** To use port 4321 for the UI and 5000 for the API:

```bash
# In .env
WEBUI_PORT=4321
PORT=5000
```

Then start as usual; open **http://YOUR_SERVER:4321** for the UI.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/README.md](docs/README.md) | Index of all docs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layout, modules, domain, persistence, data flow |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Validation, events, DB rules, logging, conventions |
| [docs/API.md](docs/API.md) | HTTP API reference |
| [docs/PROTOCOLS.md](docs/PROTOCOLS.md) | GT06 (5023), Eelink (5064), OsmAnd/Traccar Client (5055) |
| [docs/RELEASE.md](docs/RELEASE.md) | Release process and production deployment (Docker) |

## Android app

A minimal **Android app** (WebView) is in **`android/`**. It is built in GitHub Actions (no local Android toolchain needed). Run **Actions** → **Android build** → **Run workflow**, then download the **movara-debug-apk** artifact. See [android/README.md](android/README.md).

## CI

CI runs **on-demand**: GitHub Actions → **CI** workflow → **Run workflow**. Node 20, install, Prisma generate, build. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Commands

- `npm run dev` — Development server
- `npm run build` / `npm start` — Production
- `npm run prisma:generate` / `npm run prisma:migrate` / `npm run prisma:studio` — Database

## License

MIT
