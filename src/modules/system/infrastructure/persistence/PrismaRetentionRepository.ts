import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  RetentionCounts,
  RetentionOldestRemaining,
  RetentionRepository,
  RetentionResult,
} from '../../application/RetentionRepository';

const BATCH_SIZE = 5000;

function eligibleTripIds(cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT t."id"
    FROM "Trip" t
    LEFT JOIN "Vehicle" v ON v."id" = t."vehicleId"
    WHERE t."favorite" = false
      AND t."endTime" < CASE
        WHEN v."estimatedOdometerBaseAt" IS NULL THEN ${cutoff}
        ELSE LEAST(${cutoff}, v."estimatedOdometerBaseAt")
      END
  `;
}

function eligiblePositionIds(cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT p."id"
    FROM "Position" p
    WHERE p."timestamp" < CASE
      WHEN EXISTS (
        SELECT 1 FROM "Vehicle" v
        WHERE v."deviceId" = p."deviceId" AND v."estimatedOdometerBaseAt" IS NOT NULL
      ) THEN LEAST(
        ${cutoff},
        (SELECT MIN(v."estimatedOdometerBaseAt") FROM "Vehicle" v
         WHERE v."deviceId" = p."deviceId" AND v."estimatedOdometerBaseAt" IS NOT NULL)
      )
      ELSE ${cutoff}
    END
      AND NOT EXISTS (
        SELECT 1 FROM "Trip" favorite
        WHERE favorite."favorite" = true
          AND favorite."deviceId" = p."deviceId"
          AND p."timestamp" >= favorite."startTime"
          AND p."timestamp" <= favorite."endTime"
      )
  `;
}

export class PrismaRetentionRepository implements RetentionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async preview(cutoff: Date): Promise<RetentionResult> {
    const tripIds = eligibleTripIds(cutoff);
    const [trips, tripPositions, tripStops, positions, tripMerges, deviceCommands, oldestRemaining] = await Promise.all([
      this.count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Trip" t LEFT JOIN "Vehicle" v ON v."id" = t."vehicleId" WHERE t."favorite" = false AND t."endTime" < CASE WHEN v."estimatedOdometerBaseAt" IS NULL THEN ${cutoff} ELSE LEAST(${cutoff}, v."estimatedOdometerBaseAt") END`),
      this.count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "TripPosition" WHERE "tripId" IN (${tripIds})`),
      this.count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "TripStop" WHERE "tripId" IN (${tripIds})`),
      this.count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Position" p WHERE p."id" IN (${eligiblePositionIds(cutoff)})`),
      this.prisma.tripMerge.count({ where: { gapBefore: { lt: cutoff } } }),
      this.prisma.deviceCommand.count({ where: { createdAt: { lt: cutoff } } }),
      this.oldestRemaining(cutoff),
    ]);
    return {
      cutoffAt: cutoff.toISOString(),
      counts: { trips, tripPositions, tripStops, positions, tripMerges, deviceCommands },
      oldestRemaining,
    };
  }

  async run(cutoff: Date): Promise<RetentionResult> {
    const counts: RetentionCounts = {
      trips: 0,
      tripPositions: 0,
      tripStops: 0,
      positions: 0,
      tripMerges: 0,
      deviceCommands: 0,
    };

    while (true) {
      const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT child."id" FROM "TripPosition" child
        WHERE child."tripId" IN (${eligibleTripIds(cutoff)})
        LIMIT ${BATCH_SIZE}
      `);
      if (ids.length === 0) break;
      const deleted = await this.prisma.tripPosition.deleteMany({ where: { id: { in: ids.map(({ id }) => id) } } });
      counts.tripPositions += deleted.count;
    }

    while (true) {
      const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT child."id" FROM "TripStop" child
        WHERE child."tripId" IN (${eligibleTripIds(cutoff)})
        LIMIT ${BATCH_SIZE}
      `);
      if (ids.length === 0) break;
      const deleted = await this.prisma.tripStop.deleteMany({ where: { id: { in: ids.map(({ id }) => id) } } });
      counts.tripStops += deleted.count;
    }

    while (true) {
      const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`${eligibleTripIds(cutoff)} LIMIT ${BATCH_SIZE}`);
      if (ids.length === 0) break;
      const deleted = await this.prisma.trip.deleteMany({ where: { id: { in: ids.map(({ id }) => id) }, favorite: false } });
      counts.trips += deleted.count;
    }

    while (true) {
      const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`${eligiblePositionIds(cutoff)} LIMIT ${BATCH_SIZE}`);
      if (ids.length === 0) break;
      const deleted = await this.prisma.position.deleteMany({ where: { id: { in: ids.map(({ id }) => id) } } });
      counts.positions += deleted.count;
    }

    while (true) {
      const ids = await this.prisma.tripMerge.findMany({ where: { gapBefore: { lt: cutoff } }, select: { id: true }, take: BATCH_SIZE });
      if (ids.length === 0) break;
      const deleted = await this.prisma.tripMerge.deleteMany({ where: { id: { in: ids.map(({ id }) => id) } } });
      counts.tripMerges += deleted.count;
    }

    while (true) {
      const ids = await this.prisma.deviceCommand.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take: BATCH_SIZE });
      if (ids.length === 0) break;
      const deleted = await this.prisma.deviceCommand.deleteMany({ where: { id: { in: ids.map(({ id }) => id) } } });
      counts.deviceCommands += deleted.count;
    }

    return { cutoffAt: cutoff.toISOString(), counts, oldestRemaining: await this.oldestRemaining() };
  }

  private async count(query: Prisma.Sql): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(query);
    return Number(rows[0]?.count ?? 0);
  }

  private async oldestRemaining(cutoff?: Date): Promise<RetentionOldestRemaining> {
    let positionOldest: Date | null;
    let tripOldest: Date | null;
    let tripMergeOldest: Date | null;
    let deviceCommandOldest: Date | null;
    if (cutoff) {
      const [positions, trips, tripMerges, deviceCommands] = await Promise.all([
        this.prisma.$queryRaw<Array<{ oldest: Date | null }>>(Prisma.sql`SELECT MIN(p."timestamp") AS oldest FROM "Position" p WHERE p."id" NOT IN (${eligiblePositionIds(cutoff)})`),
        this.prisma.$queryRaw<Array<{ oldest: Date | null }>>(Prisma.sql`SELECT MIN(t."startTime") AS oldest FROM "Trip" t WHERE t."id" NOT IN (${eligibleTripIds(cutoff)})`),
        this.prisma.tripMerge.aggregate({ where: { gapBefore: { gte: cutoff } }, _min: { gapBefore: true } }),
        this.prisma.deviceCommand.aggregate({ where: { createdAt: { gte: cutoff } }, _min: { createdAt: true } }),
      ]);
      positionOldest = positions[0]?.oldest ?? null;
      tripOldest = trips[0]?.oldest ?? null;
      tripMergeOldest = tripMerges._min.gapBefore;
      deviceCommandOldest = deviceCommands._min.createdAt;
    } else {
      const [positions, trips, tripMerges, deviceCommands] = await Promise.all([
        this.prisma.position.aggregate({ _min: { timestamp: true } }),
        this.prisma.trip.aggregate({ _min: { startTime: true } }),
        this.prisma.tripMerge.aggregate({ _min: { gapBefore: true } }),
        this.prisma.deviceCommand.aggregate({ _min: { createdAt: true } }),
      ]);
      positionOldest = positions._min.timestamp;
      tripOldest = trips._min.startTime;
      tripMergeOldest = tripMerges._min.gapBefore;
      deviceCommandOldest = deviceCommands._min.createdAt;
    }
    return {
      positions: positionOldest,
      trips: tripOldest,
      tripMerges: tripMergeOldest,
      deviceCommands: deviceCommandOldest,
    };
  }
}
