# Movara

[![CI](https://github.com/raviteja9494/movara/actions/workflows/ci.yml/badge.svg)](https://github.com/raviteja9494/movara/actions/workflows/ci.yml)

**Self-hosted vehicle telemetry and lifecycle platform.** Node.js, TypeScript, Fastify, Prisma, PostgreSQL. Modular monolith with a minimal React Web UI in `webui/` (maps via Leaflet, Traccar-style tracking, vehicles, fuel records, maintenance, Raw log for protocol debugging).

**This project was written entirely by AI** (Cursor/Claude). Use and extend as you like.

**For humans and agents:** Start here. For architecture, development conventions, API reference, and protocols, see **[docs/](docs/)** — in particular [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and [docs/RELEASE.md](docs/RELEASE.md) for release and production deployment.

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

## Quick start (Docker, local build)

```bash
cp .env.release.example .env   # optional; set DB_PASSWORD if you want
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

- **Web UI**: http://localhost:8080 (or `WEBUI_PORT`)
- **API**: http://localhost:3000 (UI proxies `/api` and `/health` to backend)
- Uses [docker-compose.yml](docker-compose.yml) (builds images locally). For production pull-only deploy, see **Deploy with Docker (production)** below.

## Deploy with Docker (production, pull-only)

For a 24/7 server (e.g. Proxmox LXC): **download two files, set `.env`, pull and run** — no local build.

1. **Download** into a folder (e.g. `movara`):
   - [docker-compose.release.yml](docker-compose.release.yml)
   - [.env.release.example](.env.release.example) → save as **`.env`**

2. **Edit `.env`**: set at least `DB_PASSWORD` (and optionally `WEBUI_PORT`, `MOVARA_TAG` for a specific version).

3. **Pull and start**:
   ```bash
   docker compose -f docker-compose.release.yml pull
   docker compose -f docker-compose.release.yml up -d
   docker compose -f docker-compose.release.yml exec app npx prisma migrate deploy
   ```

4. **Open** http://YOUR_SERVER:8080 (or your `WEBUI_PORT`).

Pre-built images are published to GitHub Container Registry on each [release](https://github.com/raviteja9494/movara/releases). Full details: **[docs/RELEASE.md](docs/RELEASE.md)**.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/README.md](docs/README.md) | Index of all docs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layout, modules, domain, persistence, data flow |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Validation, events, DB rules, logging, conventions |
| [docs/API.md](docs/API.md) | HTTP API reference |
| [docs/PROTOCOLS.md](docs/PROTOCOLS.md) | GT06 (port 5051), OsmAnd/Traccar Client (port 5055) |
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
