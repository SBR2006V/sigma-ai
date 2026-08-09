import { NEWS_SOURCES } from "./sources";
import {
  fetchRssSource,
  type RawTopic,
} from "./rss";
import { filterFreshTopics } from "./freshness";
import { enrichTopicsWithEntities } from "./entities";
import { dedupeTopics } from "./dedupe";
import { filterMaterialDelta } from "./material-delta";
import { filterRelevantTopics } from "./relevance";
import { rankEditorialTopics } from "./editorial";
import { filterEvidence } from "./evidence";
import { selectTopics } from "./selection";
import { enrichTopicsWithArticles } from "./enrichment";

export async function discoverTopics(
  agentId: string,
) {
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

  // Stage 1: remove stale candidates.
  const freshTopics =
    filterFreshTopics(topics);

  // Stage 2: extract deterministic entities.
  const topicsWithEntities =
    await enrichTopicsWithEntities(
      freshTopics,
    );

  // Stage 3: remove exact/in-batch duplicates
  // and detect cross-run follow-up candidates.
  const dedupedTopics =
    await dedupeTopics(
      topicsWithEntities,
      agentId,
    );

  // Stage 4: determine whether a follow-up
  // candidate contains materially new information.
  const deltaCheckedTopics =
    await filterMaterialDelta(
      dedupedTopics,
    );

  // Stage 5: enrich weak RSS entries
// using the actual article page.
const enrichedTopics =
  await enrichTopicsWithArticles(
    deltaCheckedTopics,
  );

// Stage 6: apply relevance filtering
// after article enrichment so weak RSS entries
// can be evaluated using actual article content.
const relevantTopics =
  filterRelevantTopics(
    enrichedTopics,
  );

// Stage 7: score topics editorially.
  const rankedTopics =
    rankEditorialTopics(
      enrichedTopics,
    );

  // Stage 8: verify that topics contain
  // enough actual evidence for grounded generation.
  const evidenceCheckedTopics =
    filterEvidence(
      rankedTopics,
    );

  // Stage 9: make the final deterministic
  // selection decision using editorial score,
  // material delta, dedupe state, and evidence.
  const selectedTopics =
    selectTopics(
      evidenceCheckedTopics,
    );

  return selectedTopics;
}