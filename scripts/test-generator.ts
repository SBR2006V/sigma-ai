import "dotenv/config";

import {
  generateTopicContent,
} from "../lib/discovery/generator";

async function main() {
  console.log("Starting generator test...");

  const topic = {
    title:
      "OpenAI says it slowed Astra model development over security concerns",

    summary:
      "OpenAI said this model, which is still in development, reached its critical cybersecurity threshold, meaning it could independently identify and carry out cyberattacks against traditionally well-protected real-world systems.",

    url:
      "https://techcrunch.com/2026/08/07/openai-says-it-slowed-astra-model-development-over-security-concerns/",

    sourceName: "TechCrunch",
    sourceType: "SECONDARY" as const,

    publishedAt:
      new Date("2026-08-07T22:48:24Z"),

    entities: {
      known: ["OpenAI", "Astra"],
      patterns: [],
      capitalized: [],
    },

    dedupe: {
      decision: "UNIQUE" as const,
      reason: "no_memory_match",
    },

    materialDelta: {
      decision: "MATERIAL_DELTA" as const,
      reason: "new_test_information",
      similarity: 0,
      newInformation: [],
    },

    editorial: {
      score: 75,

      breakdown: {
        source: 12,
        entities: 12,
        materialDelta: 25,
        freshness: 15,
        contentQuality: 5,
        total: 69,
      },

      reasons: [
        "secondary source",
        "2 known entities",
        "very recent",
        "strong content metadata",
      ],
    },
  };

  const result =
    await generateTopicContent(topic);

  console.dir(result, {
    depth: null,
  });

  console.log("\nPASS: Generator returned valid content.");
}

main().catch((error) => {
  console.error("\nGENERATOR TEST FAILED:");
  console.error(error);

  process.exit(1);
});