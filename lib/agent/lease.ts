import { prisma } from "@/lib/db";

const LEASE_ID = "singleton";
const LEASE_DURATION_MS = 25 * 60 * 1000;

async function ensureWorkerLease(): Promise<void> {
  await prisma.workerLease.upsert({
    where: {
      id: LEASE_ID,
    },
    update: {},
    create: {
      id: LEASE_ID,
    },
  });
}

export async function acquireWorkerLease(
  runId: string,
): Promise<boolean> {
  await ensureWorkerLease();

  const now = new Date();

  const leaseExpiresAt = new Date(
    now.getTime() + LEASE_DURATION_MS,
  );

  const result = await prisma.workerLease.updateMany({
    where: {
      id: LEASE_ID,
      OR: [
        {
          leaseExpiresAt: null,
        },
        {
          leaseExpiresAt: {
            lt: now,
          },
        },
        {
          lockedBy: runId,
        },
      ],
    },
    data: {
      lockedBy: runId,
      lockedAt: now,
      leaseExpiresAt,
    },
  });

  return result.count === 1;
}

export async function releaseWorkerLease(
  runId: string,
): Promise<void> {
  await prisma.workerLease.updateMany({
    where: {
      id: LEASE_ID,
      lockedBy: runId,
    },
    data: {
      lockedBy: null,
      lockedAt: null,
      leaseExpiresAt: null,
    },
  });
}