import type { Trip, TripStop } from '../../domain/entities';

export const tripSummary = (trip: Trip) => ({
  id: trip.id, deviceId: trip.deviceId, device: trip.device, vehicleId: trip.vehicleId, vehicle: trip.vehicle,
  startTime: trip.startTime.toISOString(), endTime: trip.endTime.toISOString(), name: trip.name,
  favorite: trip.favorite, source: trip.source, createdAt: trip.createdAt.toISOString(),
});
export const stopDto = (stop: TripStop) => ({ id: stop.id, label: stop.label, startTime: stop.startTime.toISOString(), endTime: stop.endTime?.toISOString() ?? null, latitude: stop.latitude, longitude: stop.longitude, sortOrder: stop.sortOrder });
