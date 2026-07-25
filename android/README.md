# Movara Android companion

Movara's Android client is a native, offline-first Kotlin application built with the same modern foundation and design ideas as FinFly III.

## Technology

- Jetpack Compose and Material 3
- Single-activity, type-safe Navigation Compose
- Lifecycle-aware ViewModels with `StateFlow` and coroutines
- Hilt dependency injection
- Room for vehicles, offline records, and queued GPS points
- DataStore for server, session, and tracker preferences
- Retrofit, OkHttp, and Gson for the Movara API
- Foreground location service for continuous phone tracking
- Embedded Leaflet/OpenStreetMap route maps inside Compose

The app uses Clean Architecture-inspired package boundaries:

- `presentation/` contains the Compose shell, screens, dialogs, design system, and UI state.
- `data/network/` contains the Retrofit contract, DTOs, and dynamic server/auth interceptors.
- `data/local/` contains the Room database, entities, DAO, and local mappers.
- `data/settings/` contains the DataStore-backed settings repository.
- `data/MovaraRepository.kt` coordinates offline queues, synchronization, and API mapping.
- `di/` provides Hilt dependencies.

## Features

- Configure a self-hosted Movara server and log in.
- Create vehicles while offline and synchronize them later.
- Create maintenance, document, cost, and fuel records while offline.
- View fleet summaries, fuel analytics, records, and trips by vehicle.
- Browse trackers, live status, telemetry attributes, protocol packet snapshots, and recent routes.
- Browse, create, favorite, and inspect trips with route maps, statistics, and detected stops.
- Send the phone's current position to Movara.
- Run continuous foreground tracking with configurable time and distance thresholds.
- Queue GPS points in Room and retry them automatically through the OsmAnd endpoint.
- Use system light or dark mode with the Movara Material 3 design system.

## Connecting on a local network

Do not use `localhost` or `127.0.0.1` on the phone; those addresses refer to the phone itself.

1. Find the Movara computer's LAN IP address.
2. For the local web development server, use a URL such as `http://192.168.1.105:5173`.
3. For Docker, use a URL such as `http://192.168.1.105:8080`.
4. Open **Settings** in the app, enter that root URL, and log in.
5. If the URL does not open in the phone browser, check the Windows firewall and Wi-Fi client isolation.

The REST API path is added automatically. Unless overridden in tracker settings, the phone tracker derives the OsmAnd endpoint from the same host on port `5055`.

## Build and verification

The supported build path is GitHub Actions; Android Studio and a local Android SDK are not required.

Pushing a change under `android/` to `main` runs **Android CI**, which performs:

```text
testDebugUnitTest
lintDebug
assembleDebug
```

Download the resulting `movara-debug-apk` artifact from the workflow run.

Release tags beginning with `v` run the repository release workflow. That workflow repeats Android tests and lint before attaching `movara-companion-<tag>.apk` to the GitHub release.

## Requirements

- `minSdk`: 26 (Android 8)
- `targetSdk`: 36
- Java: 17
- Application ID: `com.movara.app`
