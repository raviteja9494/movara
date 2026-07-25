package com.movara.app.presentation

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DirectionsCar
import androidx.compose.material.icons.rounded.GpsFixed
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Route
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.movara.app.presentation.components.BusyBanner
import com.movara.app.presentation.components.CreateTripDialog
import com.movara.app.presentation.components.CreateVehicleDialog
import com.movara.app.presentation.components.EditFuelDialog
import com.movara.app.presentation.components.EditVehicleRecordDialog
import com.movara.app.presentation.components.RecordDialog
import com.movara.app.presentation.components.TrackerSettingsDialog
import com.movara.app.presentation.screens.DeviceDetailScreen
import com.movara.app.presentation.screens.DevicesScreen
import com.movara.app.presentation.screens.HomeScreen
import com.movara.app.presentation.screens.SettingsScreen
import com.movara.app.presentation.screens.TrackingScreen
import com.movara.app.presentation.screens.TripDetailScreen
import com.movara.app.presentation.screens.TripsScreen
import com.movara.app.presentation.screens.VehicleDetailScreen
import com.movara.app.presentation.screens.VehiclesScreen
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable
sealed interface MovaraRoute {
    @Serializable data object Home : MovaraRoute
    @Serializable data object Vehicles : MovaraRoute
    @Serializable data object Tracking : MovaraRoute
    @Serializable data object Devices : MovaraRoute
    @Serializable data object Trips : MovaraRoute
    @Serializable data object Settings : MovaraRoute
    @Serializable data class VehicleDetail(val id: String) : MovaraRoute
    @Serializable data class DeviceDetail(val id: String) : MovaraRoute
    @Serializable data class TripDetail(val id: String) : MovaraRoute
}

private enum class MainTab(
    val label: String,
    val icon: ImageVector,
    val route: MovaraRoute,
) {
    HOME("Home", Icons.Rounded.Home, MovaraRoute.Home),
    VEHICLES("Vehicles", Icons.Rounded.DirectionsCar, MovaraRoute.Vehicles),
    TRACKER("Tracker", Icons.Rounded.Sensors, MovaraRoute.Tracking),
    DEVICES("Devices", Icons.Rounded.GpsFixed, MovaraRoute.Devices),
    TRIPS("Trips", Icons.Rounded.Route, MovaraRoute.Trips),
}

private enum class LocationAction { SEND_ONCE, START_TRACKING }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MovaraApp(viewModel: MovaraViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val entry by navController.currentBackStackEntryAsState()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    var showVehicleDialog by remember { mutableStateOf(false) }
    var showRecordDialog by remember { mutableStateOf(false) }
    var recordVehicleId by remember { mutableStateOf<String?>(null) }
    var recordIsFuel by remember { mutableStateOf(false) }
    var editFuel by remember { mutableStateOf<com.movara.app.FuelRecord?>(null) }
    var editRecord by remember { mutableStateOf<com.movara.app.VehicleRecord?>(null) }
    var showTripDialog by remember { mutableStateOf(false) }
    var showTrackerSettings by remember { mutableStateOf(false) }
    var pendingLocationAction by remember { mutableStateOf<LocationAction?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            when (pendingLocationAction) {
                LocationAction.SEND_ONCE -> viewModel.sendCurrentLocation()
                LocationAction.START_TRACKING -> viewModel.startTracking()
                null -> Unit
            }
        }
        pendingLocationAction = null
    }

    fun runWithLocationPermission(action: LocationAction) {
        val granted =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (granted) {
            when (action) {
                LocationAction.SEND_ONCE -> viewModel.sendCurrentLocation()
                LocationAction.START_TRACKING -> viewModel.startTracking()
            }
        } else {
            pendingLocationAction = action
            val permissions = buildList {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
                add(Manifest.permission.ACCESS_COARSE_LOCATION)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    add(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Column(Modifier.fillMaxWidth().padding(24.dp)) {
                    Icon(Icons.Rounded.Route, null, tint = MaterialTheme.colorScheme.primary)
                    Text("Movara", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        state.settings.serverUrl.ifBlank { "Offline companion" },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        "${state.pendingCount} items waiting to sync",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Spacer(Modifier.height(8.dp))
                NavigationDrawerItem(
                    label = { Text("Settings") },
                    selected = entry?.destination?.hasRoute<MovaraRoute.Settings>() == true,
                    icon = { Icon(Icons.Rounded.Settings, null) },
                    onClick = {
                        navController.navigate(MovaraRoute.Settings)
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
                NavigationDrawerItem(
                    label = { Text("Sync everything") },
                    selected = false,
                    icon = { Icon(Icons.Rounded.Refresh, null) },
                    onClick = {
                        viewModel.syncAll()
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
        },
    ) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                TopAppBar(
                    title = { Text(destinationTitle(entry?.destination)) },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Rounded.Menu, "Open navigation")
                        }
                    },
                    actions = {
                        IconButton(onClick = viewModel::syncAll, enabled = !state.busy) {
                            Icon(Icons.Rounded.Refresh, "Synchronize")
                        }
                    },
                )
            },
            bottomBar = {
                if (entry?.destination.isTopLevel()) {
                    NavigationBar {
                        MainTab.entries.forEach { tab ->
                            NavigationBarItem(
                                selected = entry?.destination.matches(tab),
                                onClick = {
                                    navController.navigate(tab.route) {
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(tab.icon, tab.label) },
                                label = { Text(tab.label) },
                            )
                        }
                    }
                }
            },
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            Column(Modifier.padding(padding)) {
                if (state.busy) BusyBanner(state.busyLabel)
                NavHost(
                    navController = navController,
                    startDestination = MovaraRoute.Home,
                    modifier = Modifier.weight(1f),
                ) {
                    composable<MovaraRoute.Home> {
                        HomeScreen(
                            state = state,
                            onOpenVehicle = { navController.navigate(MovaraRoute.VehicleDetail(it)) },
                            onOpenTrip = { navController.navigate(MovaraRoute.TripDetail(it)) },
                            onAddVehicle = { showVehicleDialog = true },
                            onAddRecord = {
                                recordVehicleId = null
                                recordIsFuel = false
                                showRecordDialog = true
                            },
                            onSync = viewModel::syncAll,
                        )
                    }
                    composable<MovaraRoute.Vehicles> {
                        VehiclesScreen(
                            state = state,
                            onOpenVehicle = { navController.navigate(MovaraRoute.VehicleDetail(it)) },
                            onAddVehicle = { showVehicleDialog = true },
                        )
                    }
                    composable<MovaraRoute.Tracking> {
                        TrackingScreen(
                            state = state,
                            onSendLocation = { runWithLocationPermission(LocationAction.SEND_ONCE) },
                            onStart = { runWithLocationPermission(LocationAction.START_TRACKING) },
                            onStop = viewModel::stopTracking,
                            onConfigure = { showTrackerSettings = true },
                            onOpenDevice = { navController.navigate(MovaraRoute.DeviceDetail(it)) },
                        )
                    }
                    composable<MovaraRoute.Devices> {
                        DevicesScreen(
                            state = state,
                            onRefresh = viewModel::refresh,
                            onOpenDevice = { navController.navigate(MovaraRoute.DeviceDetail(it)) },
                        )
                    }
                    composable<MovaraRoute.Trips> {
                        TripsScreen(
                            state = state,
                            onRefresh = viewModel::refresh,
                            onCreate = { showTripDialog = true },
                            onOpenTrip = { navController.navigate(MovaraRoute.TripDetail(it)) },
                        )
                    }
                    composable<MovaraRoute.Settings> {
                        SettingsScreen(
                            state = state,
                            onSaveServer = viewModel::saveServer,
                            onLogin = viewModel::connect,
                            onLogout = viewModel::logout,
                            onSaveTracking = viewModel::saveTracking,
                        )
                    }
                    composable<MovaraRoute.VehicleDetail> { backStack ->
                        val route = backStack.toRoute<MovaraRoute.VehicleDetail>()
                        VehicleDetailScreen(
                            vehicleId = route.id,
                            state = state,
                            onBack = navController::popBackStack,
                            onOpenTrip = { navController.navigate(MovaraRoute.TripDetail(it)) },
                            onAddRecord = {
                                recordVehicleId = it
                                recordIsFuel = false
                                showRecordDialog = true
                            },
                            onAddFuel = {
                                recordVehicleId = it
                                recordIsFuel = true
                                showRecordDialog = true
                            },
                            onEditFuel = { editFuel = it },
                            onEditRecord = { editRecord = it },
                            onDeleteDraft = viewModel::deleteDraft,
                        )
                    }
                    composable<MovaraRoute.DeviceDetail> { backStack ->
                        val route = backStack.toRoute<MovaraRoute.DeviceDetail>()
                        DeviceDetailScreen(
                            deviceId = route.id,
                            state = state,
                            onBack = navController::popBackStack,
                            onLoadPositions = viewModel::loadDevicePositions,
                            onLoadCommands = viewModel::loadDeviceCommands,
                            onSendCommand = viewModel::sendDeviceCommand,
                        )
                    }
                    composable<MovaraRoute.TripDetail> { backStack ->
                        val route = backStack.toRoute<MovaraRoute.TripDetail>()
                        TripDetailScreen(
                            tripId = route.id,
                            state = state,
                            onBack = navController::popBackStack,
                            onLoad = viewModel::loadTrip,
                            onToggleFavorite = viewModel::toggleFavorite,
                            onUpdate = viewModel::updateTrip,
                            onSplit = { trip, at ->
                                viewModel.splitTrip(trip, at) { navController.popBackStack() }
                            },
                            onMerge = { trip, target ->
                                viewModel.mergeTrip(trip, target) { navController.popBackStack() }
                            },
                            onDelete = { trip ->
                                viewModel.deleteTrip(trip) { navController.popBackStack() }
                            },
                        )
                    }
                }
            }
        }
    }

    if (showVehicleDialog) {
        CreateVehicleDialog(
            onDismiss = { showVehicleDialog = false },
            onSave = { name, plate, odometer ->
                viewModel.addVehicle(name, plate, odometer) {
                    navController.navigate(MovaraRoute.VehicleDetail(it.id))
                }
            },
        )
    }
    if (showRecordDialog) {
        RecordDialog(
            vehicles = state.vehicles,
            initialVehicleId = recordVehicleId,
            initialFuel = recordIsFuel,
            onDismiss = { showRecordDialog = false },
            onSave = viewModel::addRecord,
        )
    }
    editFuel?.let { record ->
        EditFuelDialog(
            record = record,
            onDismiss = { editFuel = null },
            onSave = viewModel::updateFuel,
            onDelete = viewModel::deleteFuel,
        )
    }
    editRecord?.let { record ->
        EditVehicleRecordDialog(
            record = record,
            onDismiss = { editRecord = null },
            onSave = viewModel::updateVehicleRecord,
            onDelete = viewModel::deleteVehicleRecord,
        )
    }
    if (showTrackerSettings) {
        TrackerSettingsDialog(
            settings = state.settings,
            onDismiss = { showTrackerSettings = false },
            onSave = viewModel::saveTracking,
        )
    }
    if (showTripDialog) {
        CreateTripDialog(
            devices = state.devices,
            vehicles = state.vehicles.filterNot { it.isLocal },
            onDismiss = { showTripDialog = false },
            onSave = viewModel::createTrip,
        )
    }
}

private fun NavDestination?.isTopLevel(): Boolean =
    this != null && MainTab.entries.any { matches(it) }

private fun NavDestination?.matches(tab: MainTab): Boolean = when (tab) {
    MainTab.HOME -> this?.hasRoute<MovaraRoute.Home>() == true
    MainTab.VEHICLES -> this?.hasRoute<MovaraRoute.Vehicles>() == true
    MainTab.TRACKER -> this?.hasRoute<MovaraRoute.Tracking>() == true
    MainTab.DEVICES -> this?.hasRoute<MovaraRoute.Devices>() == true
    MainTab.TRIPS -> this?.hasRoute<MovaraRoute.Trips>() == true
}

private fun destinationTitle(destination: NavDestination?): String = when {
    destination?.hasRoute<MovaraRoute.Home>() == true -> "Movara"
    destination?.hasRoute<MovaraRoute.Vehicles>() == true -> "Vehicles"
    destination?.hasRoute<MovaraRoute.Tracking>() == true -> "Phone tracker"
    destination?.hasRoute<MovaraRoute.Devices>() == true -> "Devices"
    destination?.hasRoute<MovaraRoute.Trips>() == true -> "Trips"
    destination?.hasRoute<MovaraRoute.Settings>() == true -> "Settings"
    destination?.hasRoute<MovaraRoute.VehicleDetail>() == true -> "Vehicle"
    destination?.hasRoute<MovaraRoute.DeviceDetail>() == true -> "Device"
    destination?.hasRoute<MovaraRoute.TripDetail>() == true -> "Trip"
    else -> "Movara"
}
