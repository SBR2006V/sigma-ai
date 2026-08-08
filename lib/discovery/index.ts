import { NEWS_SOURCES } from "./sources";
import { fetchRssSource, type RawTopic } from "./rss";
import { filterFreshTopics } from "./freshness";
import { enrichTopicsWithEntities } from "./entities";
import { dedupeTopics } from "./dedupe";
import { filterMaterialDelta } from "./material-delta";
import { filterRelevantTopics } from "./relevance";
import { rankEditorialTopics } from "./editorial";

export async function discoverTopics() {
  const results = await Promise.allSettled(
    NEWS_SOURCES.map((source) => fetchRssSource(source)),
  );

  const topics: RawTopic[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      topics.push(...result.value);
    }
  }

  // Stage 1: remove stale candidates.
  const freshTopics = filterFreshTopics(topics);

  // Stage 2: extract deterministic entities.
  const topicsWithEntities =
    await enrichTopicsWithEntities(freshTopics);

  // Stage 3: remove exact/in-batch duplicates and
  // detect cross-run follow-up candidates.
  const dedupedTopics =
    await dedupeTopics(topicsWithEntities);

  // Stage 4: determine whether a follow-up candidate
  // actually contains materially new information.
  const deltaCheckedTopics =
    await filterMaterialDelta(dedupedTopics);

  // Stage 5: apply the existing relevance filter.
  const relevantTopics =
    filterRelevantTopics(deltaCheckedTopics);

  // Stage 6: deterministically score and rank
  // the surviving editorial candidates.
  return rankEditorialTopics(relevantTopics);
}