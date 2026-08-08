import "dotenv/config";

import { prisma } from "@/lib/db";

async function main() {
  const agent = await prisma.agent.upsert({
    where: {
      id: "00000000-0000-0000-0000-000000000001",
    },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Memory Dedupe Test Agent",
      domain: "AI and technology",
      status: "ACTIVE",
    },
  });

  const existing = await prisma.memory.findFirst({
    where: {
      agentId: agent.id,
      topicKey: "openai-astra-critical-cyber-capabilities",
    },
  });

  if (existing) {
    console.log(`Test memory already exists: ${existing.id}`);
    return;
  }

  const memory = await prisma.memory.create({
    data: {
      agentId: agent.id,

      tier: "SHORT_TERM",

      topicKey: "openai-astra-critical-cyber-capabilities",

      summary:
        "OpenAI is sharing preliminary cybersecurity evaluations for Astra and the steps being taken to strengthen safeguards and security controls.",

      importantPoints: [
        "OpenAI",
        "Astra",
        "cybersecurity",
        "critical cyber capabilities",
      ],

      keywords: [
        "OpenAI",
        "Astra",
        "cybersecurity",
        "AI",
      ],

      editorialOpinion:
        "This is a significant development in AI cybersecurity and model safety.",

      fullPost:
        "OpenAI has shared preliminary cybersecurity evaluations for Astra and described additional safeguards and security controls.",

      sources: [
        {
          title:
            "Responding to the next frontier of critical cyber capabilities",
          url:
            "https://openai.com/index/responding-next-frontier-critical-cyber-capabilities",
          sourceName: "OpenAI",
        },
      ],

      decision: "PUBLISHED",

      entities: ["OpenAI", "Astra"],

      entitiesRaw: {
        known: ["OpenAI", "Astra"],
        patterns: [],
        capitalized: [],
      },

      lastSeenAt: new Date(),

      lastPublishedAt: new Date(),

      expiresAt: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ),
    },
  });

  console.log(`Created persistent test memory: ${memory.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });