import type { FuelRecord } from '../../domain/entities';
import type { VehicleDetails } from '../../domain/repositories';

export function vehicleToDto(details: VehicleDetails) {
  const v = details.vehicle;
  const thirdParty = details.insuranceRecords.find((record) => record.subtype === 'insurance_third_party') ?? null;
  const ownDamage = details.insuranceRecords.find((record) => record.subtype === 'insurance_own_damage') ?? null;
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    licensePlate: v.licensePlate,
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: v.model,
    currentOdometer: v.currentOdometer,
    estimatedOdometerKm: v.estimatedOdometerKm,
    estimatedOdometerCalibratedAt: v.estimatedOdometerBaseAt?.toISOString() ?? null,
    fuelType: v.fuelType,
    icon: v.icon,
    photoPath: v.photoPath,
    deviceId: v.deviceId,
    createdAt: v.createdAt,
    thirdPartyInsuranceStart: thirdParty?.validFrom?.toISOString() ?? null,
    thirdPartyInsuranceEnd: thirdParty?.validUntil?.toISOString() ?? null,
    thirdPartyInsuranceProvider: thirdParty?.provider ?? null,
    thirdPartyInsuranceNumber: thirdParty?.referenceNumber ?? null,
    ownInsuranceStart: ownDamage?.validFrom?.toISOString() ?? null,
    ownInsuranceEnd: ownDamage?.validUntil?.toISOString() ?? null,
    ownInsuranceProvider: ownDamage?.provider ?? null,
    ownInsuranceNumber: ownDamage?.referenceNumber ?? null,
  };
}

export function fuelRecordToDto(record: FuelRecord) {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    date: record.date,
    odometer: record.odometer,
    fuelQuantity: record.fuelQuantity,
    fuelCost: record.fuelCost,
    fuelRate: record.fuelRate,
    latitude: record.latitude,
    longitude: record.longitude,
    createdAt: record.createdAt,
  };
}
