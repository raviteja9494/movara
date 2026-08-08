# Release and deployment

This document covers (1) how to cut a release and publish artifacts, and (2) how to deploy Movara in production (e.g. 24/7 on a Windows Proxmox LXC) using Docker Compose with pre-built images.

---

## 1. Release process (maintainer)

### Prerequisites

- Write access to the repo; ability to push tags.
- For publishing Docker images: GitHub Actions will build and push to GitHub Container Registry (`ghcr.io`).

### Steps to release

1. **Choose and apply the release version**
   - Use one plain semantic version everywhere, such as `1.3.0`. The Git tag is that same version prefixed with `v`, such as `v1.3.0`.
   - The tag is the release identity used by GitHub Releases and the release workflow. The workflow strips the leading `v` for Docker image tags and injects the plain version into the published Web UI image.
   - Update every version location in the checklist below before creating the tag.
   - Update `README.md` and affected docs in `docs/` when behavior changes materially, especially around protocols, telemetry, trips, or deployment.

   **Release version update checklist**

   | Component | Files/fields to update |
   |-----------|------------------------|
   | Backend npm package | `package.json` `version`; matching root-package entries in `package-lock.json` |
   | Web UI npm package | `webui/package.json` `version`; matching root-package entries in `webui/package-lock.json` |
   | Android app | `android/app/build.gradle.kts`: set `versionName` to the plain release version and increment integer `versionCode` for every release |
   | Home Assistant integration | `custom_components/movara/manifest.json` and `home_assistant/custom_components/movara/manifest.json` `version` fields |
   | Backend fallback metadata | Fallback version in `src/infrastructure/backup/backup.ts` |
   | Web UI build fallbacks | `webui/Dockerfile` `ARG VERSION`, both fallbacks in `webui/vite.config.ts`, and fallbacks in `webui/src/components/Header.tsx` and `webui/src/components/Sidebar.tsx` |

   All file values use `X.Y.Z`; only the Git tag uses `vX.Y.Z`.

2. **Tag and push**
   ```bash
   RELEASE_VERSION=1.3.0
   git add -A
   git commit -m "chore: release v${RELEASE_VERSION}"
   git tag -a "v${RELEASE_VERSION}" -m "Release v${RELEASE_VERSION}"
   git push origin main
   git push origin "v${RELEASE_VERSION}"
   ```

3. **GitHub Actions**
   - The **Release** workflow runs on push of tag `v*` and first calls the same reusable verification used by CI.
   - Verification validates Prisma, builds the backend and Web UI, deploys migrations to disposable PostgreSQL, and runs the full HTTP integration suite. Publishing jobs do not start unless it passes.
   - It builds the Node app, zips `dist/`, and creates a **GitHub Release** with the zip artifact.
   - It **builds and pushes Docker images** to `ghcr.io/raviteja9494/movara-app` and `ghcr.io/raviteja9494/movara-webui` (tag = version without `v`, e.g. `1.3.0`, and `latest`). The webui image is built with `VERSION` from the tag so the UI shows the correct version.

4. **Verify**
   - Check the **Releases** page for the new release and the zip.
   - Check **Packages** (or `ghcr.io/raviteja9494/movara-app`) for the new image tags.

### If you need to build/push Docker images manually

From the repo root:

```bash
# Build (replace 1.3.0 with your version)
docker build -t ghcr.io/raviteja9494/movara-app:1.3.0 .
docker build --build-arg VERSION=1.3.0 -t ghcr.io/raviteja9494/movara-webui:1.3.0 ./webui

# Push (after docker login to ghcr.io)
docker push ghcr.io/raviteja9494/movara-app:1.3.0
docker push ghcr.io/raviteja9494/movara-webui:1.3.0
```

---

## 2. Deployment (production, Immich-style)

Deploy using **only** downloaded files and `docker compose pull` — no local build.

### What you need

- A machine with Docker and Docker Compose (e.g. Linux LXC on Proxmox, or Windows Server with Docker).
- Two files: **docker-compose.release.yml** and a **.env** file.

### Step 1: Download files

Create a folder (e.g. `movara`) and download:

- **docker-compose.release.yml**  
  From the repo: [docker-compose.release.yml](../docker-compose.release.yml)  
  (Raw link or clone the repo and copy the file.)

- **.env**  
  Copy from [.env.release.example](../.env.release.example) and save as `.env` in the same folder.

### Step 2: Configure .env

Edit `.env` and set at least:

- **JWT_SECRET** - required for production login tokens. Generate one with `openssl rand -hex 32`.
- **SYSTEM_ADMIN_TOKEN** - separate operator credential for backup, restore, clear, runtime settings, and logs. Generate a different value with `openssl rand -hex 32` and send it as `X-Movara-Admin-Token` for instance-wide system APIs.

- **DB_PASSWORD** — required with no default; use a strong, unique password for PostgreSQL.
- Optionally **WEBUI_PORT** (default `8080`) and **PORT** (default `3000`) if you need different ports.

To use a specific release instead of `latest`:

- **MOVARA_TAG** — e.g. `1.3.0` (must match a published image tag).

### Step 3: Pull and start

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

### Step 4: Run database migrations

First time (and after upgrading to a new tag that includes migrations):

```bash
docker compose -f docker-compose.release.yml exec app npx prisma migrate deploy
```

### Step 5: Access

- **Web UI**: http://YOUR_SERVER_IP:8080 (or whatever `WEBUI_PORT` is).
- **API**: http://YOUR_SERVER_IP:3000 (e.g. `curl http://YOUR_SERVER_IP:3000/health`).

The UI proxies `/api` and `/health` to the backend; users only need to open the Web UI port.

### Ports used

| Port (default) | Service   | Purpose                          |
|----------------|-----------|----------------------------------|
| 8080           | webui     | Web UI (and proxied API)         |
| 3000           | app       | Backend API (optional to expose) |
| 5023           | app       | GT06 GPS protocol (TCP)          |
| 5055           | app       | OsmAnd / Traccar Client (HTTP)   |

On a firewall, open **8080** (and 5023/5055 if devices connect from the internet). Expose 3000 only if you need direct API access.
PostgreSQL is not published to the host by the standard Compose files; the app reaches it over the internal Compose network.

### Data and backups

- **PostgreSQL data** is in a Docker volume `postgres_data`. The app image includes **PostgreSQL client tools** (`pg_dump`, `psql`) so backup and restore work the same way in production.
- **Export database** (Settings) uses `POST /api/v1/system/backup/export`: the server creates a backup in a temp dir and returns the `.sql.gz` file directly (browser downloads it). No backup folder on the server is required.
- **Server-side backups** created with `POST /api/v1/system/backup` are always written under the configured backup directory (`BACKUP_DIR`, default `/app/backups` in release Docker). Restore by server path is restricted to that same directory.
- **Import database** uploads a `.sql.gz` file; the server drops the current database, recreates it, and restores the dump so only the imported data remains.
- **Protocol debug files** can be enabled at runtime with `PROTOCOL_DEBUG=true`. In Docker deploys, the default compose files mount `./protocol-logs` into the app container so protocol `.jsonl` files persist on the host.

### Upgrading to a new version

1. Set **MOVARA_TAG** in `.env` to the new version (e.g. `1.3.0`).
2. Pull and recreate:
   ```bash
   docker compose -f docker-compose.release.yml pull
   docker compose -f docker-compose.release.yml up -d
   ```
3. Run migrations if needed:
   ```bash
   docker compose -f docker-compose.release.yml exec app npx prisma migrate deploy
   ```

---

## 3. Deploy using local build (no pre-built images)

If you prefer to build images yourself (e.g. before images are published):

1. Clone the repo; in the repo root create `.env` from `.env.release.example`.
2. Use the default **docker-compose.yml** (which uses `build:` instead of `image:`):
   ```bash
   docker compose up -d --build
   docker compose exec app npx prisma migrate deploy
   ```
3. Access as above (e.g. http://YOUR_SERVER:8080).

This is the same as the “Quick start (Docker)” in the main README.
