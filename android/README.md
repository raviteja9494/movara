# Movara Android companion

Native offline-first Android companion app for Movara. No local Android toolchain is required; the APK is built in **GitHub Actions**.

## Current features

- Native Android UI, no WebView.
- Companion dashboard with Home, Records, Tracking, Devices, and Trips sections.
- Manual Movara server URL configuration.
- Login with an existing Movara account.
- Cache vehicles locally after a successful server refresh.
- View devices and recent trips from Movara.
- View latest positions for known tracking devices.
- Render trip route previews inside the app.
- Send the phone's current location to Movara as a mobile tracking device.
- Continuous foreground phone tracking with persistent notification.
- Offline GPS queue: phone points are saved locally and retried when the server is reachable.
- Add vehicle records while offline.
- Add fuel fill-ups through a dedicated shortcut.
- Queue pending records in local SQLite storage.
- Sync pending records to `/api/v1/vehicle-records` when the server is reachable.
- Sync queued fuel fill-ups to `/api/v1/vehicles/:id/fuel-records`.
- Delete an incorrect pending draft before it syncs.

This is the foundation for the larger companion app. Receipt/photo capture and phone-as-tracker background GPS can be added on top of this offline sync layer.

## Accessing from your phone (same WiFi as laptop)

Phone and laptop must be on the **same network**. Do **not** use `localhost` or `127.0.0.1` in the app—that means “this device” (on the phone it’s the phone).

1. **Find your laptop’s IP** (Windows): open PowerShell or CMD and run `ipconfig`. Under your WiFi adapter look for **IPv4 Address** (e.g. `192.168.1.105` or `10.0.0.5`).

2. **Pick the right port:**
   - **Running with npm** (backend + webui dev): use port **5173** → `http://192.168.1.105:5173`
   - **Running with Docker** (`docker-compose up`): use port **8080** → `http://192.168.1.105:8080`

3. **In the Movara app**, open **Server / login**, enter that server URL (e.g. `http://192.168.1.105:5173`), then log in. Use **http** (not https) for a local server.

4. **If it still doesn’t load**, try in order:

   **A. Test in the phone’s browser first**  
   On the phone, open Chrome (or any browser) and go to `http://YOUR_LAPTOP_IP:5173`.  
   - If that **fails**: the problem is network or firewall (see B and C).  
   - If that **works**: use the same URL in the Movara app.

   **B. Allow the port in Windows Firewall** (run PowerShell **as Administrator**):
   ```powershell
   New-NetFirewallRule -DisplayName "Movara" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
   ```
   Or run the script: `webui\scripts\allow-firewall-windows.ps1` (as Admin).

   **C. Same network**  
   Phone and laptop must be on the **same WiFi** (not guest WiFi vs main, not phone on mobile data). Some routers have “AP isolation” that blocks device-to-device access—turn it off if needed.

## Build (GitHub Actions)

1. Push to `main` or change files under `android/` or this workflow.
2. Or run manually: **Actions** → **Android build** → **Run workflow**.
3. When the run finishes, open the job and download the **movara-debug-apk** artifact (debug APK).

No Android Studio or local SDK needed.

## Build locally (optional)

If you have Android Studio or the Android SDK and Gradle:

```bash
cd android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Requirements

- **minSdk**: 26 (Android 8.0)
- **targetSdk**: 34

## Package

`com.movara.app`
