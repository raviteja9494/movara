import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['info', 'warn', 'error']
          : ['error'],
    });
  }
  return prisma;
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('SIGINT received, disconnecting database...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, disconnecting database...');
  await disconnectDatabase();
  process.exit(0);
});
