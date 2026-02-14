# Movara Android app

Minimal Android app that loads the Movara web UI in a WebView. No local Android toolchain required—the app is built in **GitHub Actions**.

## Features

- **WebView** loads your Movara server (login, vehicles, tracking, etc.)
- **First run**: enter your server URL (e.g. `https://movara.example.com` or `http://10.0.2.2:8080` for emulator)
- URL is saved and reused; clear app data to change it
- Back button navigates inside the WebView when possible

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
