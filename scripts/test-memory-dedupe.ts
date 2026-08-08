import "dotenv/config";

import { prisma } from "@/lib/db";

async function main() {
  console.log("Starting memory dedupe test...");

  // ------------------------------------------------------------
  // 1. Create/reuse a dedicated test agent
  // ------------------------------------------------------------

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

  console.log(`Test agent: ${agent.id}`);

  // ------------------------------------------------------------
  // 2. Create a memory representing a previously published topic
  // ------------------------------------------------------------

  const originalTopic = {
    title: "Responding to the next frontier of critical cyber capabilities",
    summary:
      "OpenAI is sharing preliminary cybersecurity evaluations for Astra and the steps being taken to strengthen safeguards and security controls.",
    url:
      "https://openai.com/index/responding-next-frontier-critical-cyber-capabilities",
    sourceName: "OpenAI",
    sourceType: "PRIMARY",
    publishedAt: new Date("2026-08-07T15:20:00Z"),
    entities: {
      known: ["OpenAI", "Astra"],
      patterns: [],
      capitalized: [],
    },
  };

  const memory = await prisma.memory.create({
    data: {
      agentId: agent.id,

      tier: "SHORT_TERM",

      topicKey: "openai-astra-critical-cyber-capabilities",

      summary: originalTopic.summary,

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
          title: originalTopic.title,
          url: originalTopic.url,
          sourceName: originalTopic.sourceName,
        },
      ],

      decision: "PUBLISHED",

      entities: ["OpenAI", "Astra"],

      entitiesRaw: {
        known: originalTopic.entities.known,
        patterns: originalTopic.entities.patterns,
        capitalized: originalTopic.entities.capitalized,
      },

      lastSeenAt: new Date(),

      lastPublishedAt: new Date(),

      expiresAt: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ),
    },
  });

  console.log(`Created memory: ${memory.id}`);

  // ------------------------------------------------------------
  // 3. Verify that the memory actually exists
  // ------------------------------------------------------------

  const storedMemory = await prisma.memory.findUnique({
    where: {
      id: memory.id,
    },
    select: {
      id: true,
      agentId: true,
      topicKey: true,
      decision: true,
      entities: true,
      entitiesRaw: true,
    },
  });

  if (!storedMemory) {
    throw new Error("Memory was created but could not be read back.");
  }

  console.log("\nStored memory:");
  console.log(
    JSON.stringify(storedMemory, null, 2),
  );

  // ------------------------------------------------------------
  // 4. Query memories using the same entity information
  // ------------------------------------------------------------

  const matchingMemories = await prisma.memory.findMany({
    where: {
      agentId: agent.id,
      decision: {
        in: ["PUBLISHED", "PUBLISHED_DEFERRED"],
      },
      entities: {
        hasSome: ["OpenAI", "Astra"],
      },
    },
    select: {
      id: true,
      topicKey: true,
      decision: true,
      entities: true,
    },
  });

  console.log("\nMatching memories:");

  console.log(
    JSON.stringify(matchingMemories, null, 2),
  );

  // ------------------------------------------------------------
  // 5. Verify the expected match
  // ------------------------------------------------------------

  const found = matchingMemories.some(
    (candidate) => candidate.id === memory.id,
  );

  if (!found) {
    throw new Error(
      "FAIL: The newly created memory was not found by the entity query.",
    );
  }

  console.log(
    "\nPASS: Existing memory was successfully found by entity overlap.",
  );

  // ------------------------------------------------------------
  // 6. Clean up the test memory and test agent
  // ------------------------------------------------------------

  await prisma.memory.delete({
    where: {
      id: memory.id,
    },
  });

  await prisma.agent.delete({
    where: {
      id: agent.id,
    },
  });

  console.log("\nTest data cleaned up.");
  console.log("Memory dedupe database test completed successfully.");
}

main()
  .catch((error) => {
    console.error("\nMemory dedupe test failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });