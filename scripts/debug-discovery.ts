import "dotenv/config";

import { NEWS_SOURCES } from "../lib/discovery/sources";
import {
  fetchRssSource,
  type RawTopic,
} from "../lib/discovery/rss";
import { filterFreshTopics } from "../lib/discovery/freshness";
import { enrichTopicsWithEntities } from "../lib/discovery/entities";
import { dedupeTopics } from "../lib/discovery/dedupe";
import {
  filterMaterialDelta,
  evaluateMaterialDelta,
} from "../lib/discovery/material-delta";
import { filterRelevantTopics } from "../lib/discovery/relevance";
import { enrichTopicsWithArticles } from "../lib/discovery/enrichment";
import { rankEditorialTopics } from "../lib/discovery/editorial";
import { filterEvidence } from "../lib/discovery/evidence";
import { selectTopics } from "../lib/discovery/selection";

const agentId =
  "496c3ebc-da04-4e58-892f-1cb3f5451f81";

async function main() {
  console.log("\n=== DISCOVERY DEBUG ===\n");

  const results = await Promise.allSettled(
    NEWS_SOURCES.map((source) =>
      fetchRssSource(source),
    ),
  );

  const topics: RawTopic[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      topics.push(...result.value);
    }
  }

  console.log("RSS:", topics.length);

  const fresh = filterFreshTopics(topics);

  console.log("Fresh:", fresh.length);

  if (topics.length > 0) {
    console.log("\nSample RSS dates:");

    for (const topic of topics.slice(0, 10)) {
      const ageHours = topic.publishedAt
        ? (Date.now() -
            topic.publishedAt.getTime()) /
          (1000 * 60 * 60)
        : null;

      console.log(
        `${topic.sourceName} | ${
          topic.publishedAt?.toISOString() ??
          "NO DATE"
        } | ${
          ageHours === null
            ? "unknown age"
            : `${ageHours.toFixed(1)}h`
        } | ${topic.title}`,
      );
    }
  }

  const entities =
    await enrichTopicsWithEntities(fresh);

  console.log("Entities:", entities.length);

  const deduped =
    await dedupeTopics(
      entities,
      agentId,
    );

  console.log("Deduped:", deduped.length);

  const delta =
  await filterMaterialDelta(deduped);

console.log("Material delta:", delta.length);

console.log("\n=== MATERIAL DELTA RESULTS ===");

for (const topic of deduped) {
  const result =
    await evaluateMaterialDelta(topic);

  console.log(
    `[${result.decision}] ${topic.sourceName} | ${topic.title}`,
  );

  console.log(
    `  Dedupe: ${topic.dedupe.decision}`,
  );

  if (topic.dedupe.duplicateOf) {
    console.log(
      `  Duplicate of memory: ${topic.dedupe.duplicateOf}`,
    );
  }

  console.log(
    `  Reason: ${result.reason}`,
  );

  console.log(
    `  Similarity: ${result.similarity.toFixed(3)}`,
  );

  if (result.newInformation.length > 0) {
    console.log(
      `  New information: ${result.newInformation
        .slice(0, 10)
        .join(", ")}`,
    );
  }

  console.log("");
}

  /*
   * ============================================================
   * ARTICLE ENRICHMENT
   * ============================================================
   *
   * Article enrichment now happens BEFORE relevance.
   *
   * This allows relevance scoring to use the actual
   * article evidence rather than relying only on RSS
   * summaries.
   */

  console.log(
    "\n=== BEFORE ARTICLE ENRICHMENT ===",
  );

  for (const topic of delta.slice(0, 20)) {
    const words = topic.summary
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length;

    console.log(
      `[${topic.sourceName}] ${topic.title} | summary words: ${words}`,
    );
  }

  const enriched =
    await enrichTopicsWithArticles(delta);

  console.log(
    "\nArticle enriched:",
    enriched.length,
  );

  console.log(
    "\n=== AFTER ARTICLE ENRICHMENT ===",
  );

  for (const topic of enriched.slice(0, 20)) {
    const words = topic.summary
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length;

    console.log(
      `[${topic.sourceName}] ${topic.title} | summary words: ${words}`,
    );
  }

  /*
   * ============================================================
   * RELEVANCE
   * ============================================================
   */

  const relevant =
    filterRelevantTopics(enriched);

  console.log(
    "\nRelevant:",
    relevant.length,
  );

  console.log(
    "\n=== RELEVANT TOPICS ===",
  );

  for (const topic of relevant.slice(0, 10)) {
    console.log(
      `[PASS] ${topic.sourceName} | ${topic.title}`,
    );
  }

  /*
   * ============================================================
   * EDITORIAL RANKING
   * ============================================================
   */

  const ranked =
    rankEditorialTopics(relevant);

  console.log(
    "\nRanked:",
    ranked.length,
  );

  if (ranked.length > 0) {
    console.log("\nRanked:");

    for (const topic of ranked.slice(0, 10)) {
      console.log(
        `- ${topic.editorial.score} | ${topic.title}`,
      );
    }
  }

  /*
   * ============================================================
   * EVIDENCE
   * ============================================================
   */

  const evidence =
    filterEvidence(ranked);

  console.log(
    "\nEvidence checked:",
    evidence.length,
  );

  if (evidence.length > 0) {
    console.log("\nEvidence:");

    for (const topic of evidence.slice(0, 10)) {
      console.log(
        `- ${topic.evidence.decision} (${topic.evidence.evidenceScore}) | ${topic.title}`,
      );
    }
  }

  /*
   * ============================================================
   * SELECTION
   * ============================================================
   */

  const selected = selectTopics(evidence);

const selectedCount = selected.filter(
  (topic) => topic.selection.decision === "SELECTED",
).length;

const heldCount = selected.filter(
  (topic) => topic.selection.decision === "HELD",
).length;

const rejectedCount = selected.filter(
  (topic) => topic.selection.decision === "REJECTED",
).length;

console.log("Selection results:");
console.log("SELECTED:", selectedCount);
console.log("HELD:", heldCount);
console.log("REJECTED:", rejectedCount);

console.log("\nSelection decisions:");

for (const topic of selected) {
  console.log(
    `- ${topic.selection.decision} | ${topic.editorial.score} | ${topic.title} | ${topic.selection.reason}`,
  );
}

  console.log("\n=== END ===\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});