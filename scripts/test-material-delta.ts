import "dotenv/config";

import { prisma } from "@/lib/db";
import {
  evaluateMaterialDelta,
} from "@/lib/discovery/material-delta";

import type {
  DedupedTopic,
} from "@/lib/discovery/dedupe";

const AGENT_ID =
  "00000000-0000-0000-0000-000000000001";

function makeTopic(
  title: string,
  summary: string,
  entities: string[],
  duplicateOf?: string,
): DedupedTopic {
  return {
    title,
    summary,
    url: "https://example.com/test",
    sourceName: "Test Source",
    sourceType: "PRIMARY",
    publishedAt: new Date(),
    entities: {
      known: entities,
      patterns: [],
      capitalized: [],
    },
    dedupe: duplicateOf
      ? {
          decision: "FOLLOW_UP_CANDIDATE",
          duplicateOf,
          reason:
            "memory_shared_entity_and_title_similarity",
        }
      : {
          decision: "UNIQUE",
          reason: "no_memory_match",
        },
  };
}

async function main() {
  console.log(
    "Starting material-delta test...",
  );

  /*
   * Create the baseline memory.
   */
  const memory = await prisma.memory.create({
    data: {
      agentId: AGENT_ID,
      tier: "SHORT_TERM",
      topicKey:
        "openai-astra-critical-cyber-capabilities",
      summary:
        "OpenAI published cybersecurity evaluations for Astra and described the model's ability to identify and carry out cyberattacks against well-protected systems.",
      importantPoints: [
        "Astra reached a critical cybersecurity threshold.",
        "OpenAI is slowing development because of security concerns.",
      ],
      keywords: [
        "OpenAI",
        "Astra",
        "cybersecurity",
      ],
      editorialOpinion:
        "Important cybersecurity development.",
      fullPost:
        "OpenAI shared preliminary cybersecurity evaluations for Astra.",
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
      expiresAt:
        new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  console.log(
    `Created test memory: ${memory.id}`,
  );

  /*
   * CASE 1
   * Completely new story.
   */
  const uniqueTopic = makeTopic(
    "Cloudflare launches Kitesurf",
    "Cloudflare introduced a browser designed specifically for AI agents.",
    ["Cloudflare", "Kitesurf"],
  );

  const uniqueResult =
    await evaluateMaterialDelta(uniqueTopic);

  console.log("\nCASE 1: UNIQUE STORY");
  console.log(uniqueResult);

  /*
   * CASE 2
   * Same story, essentially no new information.
   */
  const duplicateTopic = makeTopic(
    "OpenAI Astra cybersecurity capabilities",
    "OpenAI published cybersecurity evaluations for Astra.",
    ["OpenAI", "Astra"],
    memory.id,
  );

  const duplicateResult =
    await evaluateMaterialDelta(duplicateTopic);

  console.log(
    "\nCASE 2: SAME STORY / NO NEW INFORMATION",
  );
  console.log(duplicateResult);

  /*
   * CASE 3
   * Same story with a genuinely new entity.
   * This should be flagged as a possible material delta,
   * not automatically treated as editorially publishable.
   */
  const changedEntityTopic = makeTopic(
    "OpenAI Astra cybersecurity update",
    "OpenAI says Astra has now been evaluated against a newly disclosed protected infrastructure environment.",
    ["OpenAI", "Astra", "NewInfrastructure"],
    memory.id,
  );

  const changedEntityResult =
    await evaluateMaterialDelta(
      changedEntityTopic,
    );

  console.log(
    "\nCASE 3: SAME STORY / NEW ENTITY",
  );
  console.log(changedEntityResult);

  /*
   * CASE 4
   * Same story but substantially different information.
   */
  const changedInformationTopic = makeTopic(
    "OpenAI changes Astra development plans",
    "OpenAI has now paused Astra deployment after additional evaluations found materially higher cyberattack capabilities than previously reported.",
    ["OpenAI", "Astra"],
    memory.id,
  );

  const changedInformationResult =
    await evaluateMaterialDelta(
      changedInformationTopic,
    );

  console.log(
    "\nCASE 4: SAME STORY / NEW INFORMATION",
  );
  console.log(changedInformationResult);

  await prisma.memory.delete({
    where: {
      id: memory.id,
    },
  });

  console.log(
    "\nTest memory cleaned up.",
  );

  await prisma.$disconnect();

  console.log(
    "Material-delta test completed.",
  );
}

main().catch(async (error) => {
  console.error(
    "Material-delta test failed:",
    error,
  );

  await prisma.$disconnect();

  process.exit(1);
});