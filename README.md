# Movara

[![CI](https://github.com/raviteja9494/movara/actions/workflows/ci.yml/badge.svg)](https://github.com/raviteja9494/movara/actions/workflows/ci.yml)

**Self-hosted vehicle telemetry and lifecycle platform (API-only).** Node.js, TypeScript, Fastify, Prisma, PostgreSQL. Modular monolith with a minimal React Web UI in `webui/` (maps via Leaflet, Traccar-style tracking).

**For humans and agents:** Start here. For architecture, development conventions, API reference, and GT06 protocol details, see **[docs/](docs/)** — in particular [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

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

## Quick start (Docker)

```bash
docker-compose up
# First time: run migrations
docker-compose exec app npx prisma migrate deploy
```

- **Web UI**: http://localhost:8080 (or `WEBUI_PORT`)
- **API**: http://localhost:3000 (UI proxies `/api` and `/health` to backend)

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/README.md](docs/README.md) | Index of all docs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layout, modules, domain, persistence, data flow |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Validation, events, DB rules, logging, conventions |
| [docs/API.md](docs/API.md) | HTTP API reference |
| [docs/PROTOCOLS.md](docs/PROTOCOLS.md) | GT06 protocol and simulator in `tools/gt06_simulator/` |

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
