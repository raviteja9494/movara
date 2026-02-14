# Release and deployment

This document covers (1) how to cut a release and publish artifacts, and (2) how to deploy Movara in production (e.g. 24/7 on a Windows Proxmox LXC) using Docker Compose with pre-built images.

---

## 1. Release process (maintainer)

### Prerequisites

- Write access to the repo; ability to push tags.
- For publishing Docker images: GitHub Actions will build and push to GitHub Container Registry (`ghcr.io`).

### Steps to release

1. **Version and changelog**
   - Bump `version` in `package.json` if desired (e.g. `0.1.0` → `0.2.0`).
   - Optionally update `README.md` or `CHANGELOG.md` with notable changes.

2. **Tag and push**
   ```bash
   git add package.json README.md   # and any changelog
   git commit -m "chore: release v0.1.0"
   git tag v0.1.0
   git push origin main
   git push origin v0.1.0
   ```

3. **GitHub Actions**
   - The **Release** workflow runs on push of tag `v*`.
   - It builds the Node app, zips `dist/`, and creates a **GitHub Release** with the zip artifact.
   - It also **builds and pushes Docker images** to `ghcr.io/raviteja9494/movara-app` and `ghcr.io/raviteja9494/movara-webui` (tag = version without `v`, e.g. `0.1.0`, and `latest`).

4. **Verify**
   - Check the **Releases** page for the new release and the zip.
   - Check **Packages** (or `ghcr.io/raviteja9494/movara-app`) for the new image tags.

### If you need to build/push Docker images manually

From the repo root:

```bash
# Build
docker build -t ghcr.io/raviteja9494/movara-app:0.1.0 .
docker build -t ghcr.io/raviteja9494/movara-webui:0.1.0 ./webui

# Push (after docker login to ghcr.io)
docker push ghcr.io/raviteja9494/movara-app:0.1.0
docker push ghcr.io/raviteja9494/movara-webui:0.1.0
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

- **DB_PASSWORD** — use a strong password for PostgreSQL.
- Optionally **WEBUI_PORT** (default `8080`) and **PORT** (default `3000`) if you need different ports.

To use a specific release instead of `latest`:

- **MOVARA_TAG** — e.g. `0.1.0` (must match a published image tag).

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
| 5051           | app       | GT06 GPS protocol (TCP)          |
| 5055           | app       | OsmAnd / Traccar Client (HTTP)   |
| 5432           | db        | PostgreSQL (usually not exposed) |

On a firewall, open **8080** (and 5051/5055 if devices connect from the internet). Expose 3000 only if you need direct API access.

### Data and backups

- **PostgreSQL data** is in a Docker volume `postgres_data`. To back up, use the API: `POST /api/v1/system/backup` (creates a file under `./backups` if that folder is mounted).
- The release compose mounts `./backups` into the app container for backup/restore.

### Upgrading to a new version

1. Set **MOVARA_TAG** in `.env` to the new version (e.g. `0.2.0`).
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
