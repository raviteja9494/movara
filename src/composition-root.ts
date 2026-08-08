import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { registerAuthHook, registerAuthRoutes } from './modules/auth/infrastructure/AuthApi';
import { AuthUseCases } from './modules/auth/application/use-cases';
import { PrismaAuthRepository } from './modules/auth/infrastructure/persistence/PrismaAuthRepository';
import { CryptoPasswordService } from './modules/auth/infrastructure/security/CryptoPasswordService';
import { JwtTokenService, registrationAfterFirstUserEnabled, resolveJwtSecret } from './modules/auth/infrastructure/security/JwtTokenService';
import { registerLocationRoutes } from './modules/locations/infrastructure/api';
import { LocationUseCases } from './modules/locations/application/use-cases';
import { PrismaSavedLocationRepository } from './modules/locations/infrastructure/persistence';
import { registerMaintenanceRoutes } from './modules/maintenance/infrastructure/api';
import { MaintenanceReminderUseCase, MaintenanceUseCases } from './modules/maintenance/application/use-cases';
import { PrismaMaintenanceRepository } from './modules/maintenance/infrastructure/persistence/PrismaMaintenanceRepository';
import { BackupService } from './modules/system/application/BackupService';
import { registerSystemRoutes } from './modules/system/infrastructure/api';
import { EnsureTrackingDeviceUseCase } from './modules/tracking/application/use-cases/EnsureTrackingDeviceUseCase';
import { ProcessIncomingPositionUseCase } from './modules/tracking/application/use-cases/ProcessIncomingPositionUseCase';
import { SendDeviceCommandUseCase } from './modules/tracking/application/use-cases/SendDeviceCommandUseCase';
import { registerTrackingRoutes } from './modules/tracking/infrastructure/api';
import { DeviceCommandStore } from './modules/tracking/infrastructure/device/DeviceCommandStore';
import { DeviceStateStore } from './modules/tracking/infrastructure/device/DeviceStateStore';
import { LiveDeviceConnectionRegistry } from './modules/tracking/infrastructure/device/LiveDeviceConnectionRegistry';
import { PrismaDeviceRepository } from './modules/tracking/infrastructure/persistence/PrismaDeviceRepository';
import { PrismaPositionRepository } from './modules/tracking/infrastructure/persistence/PrismaPositionRepository';
import { PrismaRawLogStore } from './modules/tracking/infrastructure/persistence/PrismaRawLogStore';
import { AutoTripOnIgnitionSubscriber } from './modules/trips/infrastructure/AutoTripOnIgnitionSubscriber';
import { registerTripRoutes } from './modules/trips/infrastructure/api';
import { TripUseCases } from './modules/trips/application/use-cases';
import { PrismaTripRepository } from './modules/trips/infrastructure/persistence/PrismaTripRepository';
import { registerVehicleRoutes } from './modules/vehicles/infrastructure/api';
import { FuelRecordUseCases, VehicleTravelUseCases, VehicleUseCases } from './modules/vehicles/application/use-cases';
import { PrismaFuelRecordRepository } from './modules/vehicles/infrastructure/persistence/PrismaFuelRecordRepository';
import { PrismaVehicleRepository } from './modules/vehicles/infrastructure/persistence/PrismaVehicleRepository';
import { PrismaVehicleTravelRepository } from './modules/vehicles/infrastructure/persistence/PrismaVehicleTravelRepository';
import { runtimeSettingsStore } from './shared/runtimeSettings/RuntimeSettingsStore';
import { InstanceOperatorPolicy, OwnershipPolicy, resolveInstanceOperatorToken } from './shared/authorization';
import { PrismaOwnershipReader } from './infrastructure/authorization/PrismaOwnershipReader';
import { DeviceUseCases } from './modules/tracking/application/use-cases';
import { eventDispatcher } from './shared/utils';
import type {
  DeviceTelemetryEvent,
  PositionRecordedEvent,
} from './modules/tracking/application/use-cases';

export interface CompositionRoot {
  prisma: PrismaClient;
  deviceStateStore: DeviceStateStore;
  deviceCommandStore: DeviceCommandStore;
  initialize(): Promise<void>;
  registerRoutes(app: FastifyInstance): Promise<void>;
  disconnect(): Promise<void>;
}

export function createCompositionRoot(): CompositionRoot {
  const prisma = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['info', 'warn', 'error']
        : ['error'],
  });

  const deviceRepository = new PrismaDeviceRepository(prisma);
  const positionRepository = new PrismaPositionRepository(prisma);
  const vehicleRepository = new PrismaVehicleRepository(prisma);
  const fuelRecordRepository = new PrismaFuelRecordRepository(prisma);
  const vehicleTravelRepository = new PrismaVehicleTravelRepository(prisma);
  const maintenanceRepository = new PrismaMaintenanceRepository(prisma);
  const savedLocationRepository = new PrismaSavedLocationRepository(prisma);
  const tripRepository = new PrismaTripRepository(prisma);
  const authRepository = new PrismaAuthRepository(prisma);
  const deviceStateStore = new DeviceStateStore(prisma);
  const deviceCommandStore = new DeviceCommandStore(prisma);
  const liveDeviceConnectionRegistry = new LiveDeviceConnectionRegistry();
  const rawLogStore = new PrismaRawLogStore(prisma);
  const ownership = new OwnershipPolicy(new PrismaOwnershipReader(prisma));
  const instanceOperatorPolicy = new InstanceOperatorPolicy(resolveInstanceOperatorToken());

  const processPositionUseCase = new ProcessIncomingPositionUseCase(
    positionRepository,
    deviceRepository,
    deviceStateStore,
  );
  const ensureTrackingDeviceUseCase = new EnsureTrackingDeviceUseCase(deviceRepository);
  const sendDeviceCommandUseCase = new SendDeviceCommandUseCase(
    deviceRepository,
    deviceStateStore,
    deviceCommandStore,
    liveDeviceConnectionRegistry,
    ownership,
  );
  const autoTripOnIgnitionSubscriber = new AutoTripOnIgnitionSubscriber(prisma);
  eventDispatcher.subscribe<PositionRecordedEvent>('position.recorded', (event) =>
    autoTripOnIgnitionSubscriber.handle(event));
  eventDispatcher.subscribe<DeviceTelemetryEvent>('device.telemetry', (event) =>
    autoTripOnIgnitionSubscriber.handleTelemetry(event));
  const backupService = new BackupService();
  const deviceUseCases = new DeviceUseCases(deviceRepository, ownership);
  const vehicleUseCases = new VehicleUseCases(vehicleRepository, vehicleTravelRepository, ownership);
  const fuelRecordUseCases = new FuelRecordUseCases(vehicleRepository, fuelRecordRepository, ownership);
  const vehicleTravelUseCases = new VehicleTravelUseCases(vehicleRepository, vehicleTravelRepository, ownership);
  const maintenanceUseCases = new MaintenanceUseCases(maintenanceRepository, ownership);
  const locationUseCases = new LocationUseCases(savedLocationRepository, ownership);
  const maintenanceReminderUseCase = new MaintenanceReminderUseCase(maintenanceRepository, ownership);
  const tripUseCases = new TripUseCases(tripRepository, ownership);
  const authUseCases = new AuthUseCases(authRepository, new CryptoPasswordService(), new JwtTokenService(resolveJwtSecret()), registrationAfterFirstUserEnabled());

  return {
    prisma,
    deviceStateStore,
    deviceCommandStore,
    async initialize(): Promise<void> {
      await runtimeSettingsStore.initialize(prisma);
    },
    async registerRoutes(app: FastifyInstance): Promise<void> {
      await registerAuthRoutes(app, authUseCases);
      registerAuthHook(app, authUseCases);
      await registerTrackingRoutes(app, {
        positionRepository,
        deviceRepository,
        processPositionUseCase,
        ensureTrackingDeviceUseCase,
        sendDeviceCommandUseCase,
        deviceStateStore,
        deviceCommandStore,
        liveDeviceConnectionRegistry,
        rawLogStore,
        deviceUseCases,
        ownership,
        instanceOperatorPolicy,
      });
      await registerVehicleRoutes(app, {
        vehicleUseCases,
        fuelRecordUseCases,
        vehicleTravelUseCases,
      });
      await registerTripRoutes(app, tripUseCases);
      await registerMaintenanceRoutes(app, maintenanceUseCases);
      await registerLocationRoutes(app, locationUseCases);
      await registerSystemRoutes(app, {
        prisma,
        backupService,
        deviceStateStore,
        deviceCommandStore,
        vehicleUseCases,
        maintenanceReminderUseCase,
        instanceOperatorPolicy,
      });
    },
    async disconnect(): Promise<void> {
      await prisma.$disconnect();
    },
  };
}
