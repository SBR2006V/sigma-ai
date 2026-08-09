import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("@/lib/db");

  const agentId =
    "496c3ebc-da04-4e58-892f-1cb3f5451f81";

  const agent = await prisma.agent.findUnique({
    where: {
      id: agentId,
    },
    select: {
      id: true,
      name: true,
      domain: true,
      status: true,
      initializedAt: true,
      lastRunAt: true,
      nextRunAt: true,
      lastRunStatus: true,
    },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const runs = await prisma.agentRun.findMany({
    where: {
      agentId,
    },
    orderBy: {
      startedAt: "desc",
    },
    take: 10,
  });

  const posts = await prisma.post.findMany({
    where: {
      agentId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
    select: {
      id: true,
      agentId: true,
      topicId: true,
      text: true,
      rationale: true,
      sources: true,
      title: true,
      whySelected: true,
      whyNow: true,
      createdAt: true,
    },
  });

  const memories = await prisma.memory.findMany({
    where: {
      agentId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  const activityLogs =
    await prisma.activityLog.findMany({
      where: {
        agentId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
      select: {
        type: true,
        message: true,
        score: true,
        createdAt: true,
      },
    });

  console.log(
    JSON.stringify(
      {
        agent,
        runs,
        posts,
        memories,
        activityLogs,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});