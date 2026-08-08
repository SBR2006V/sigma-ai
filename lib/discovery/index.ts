import { NEWS_SOURCES } from "./sources";
import { fetchRssSource, type RawTopic } from "./rss";
import { filterFreshTopics } from "./freshness";
import { enrichTopicsWithEntities } from "./entities";
import { dedupeTopics } from "./dedupe";
import { filterMaterialDelta } from "./material-delta";
import { filterRelevantTopics } from "./relevance";
import { rankEditorialTopics } from "./editorial";
import { selectTopics } from "./selection";
import { filterEvidence } from "./evidence";

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

  // Stage 5: apply relevance filtering.
  const relevantTopics =
    filterRelevantTopics(deltaCheckedTopics);

  // Stage 6: score topics editorially.
  const rankedTopics =
    rankEditorialTopics(relevantTopics);

  // Stage 7: deterministically select candidates.
  const selectedTopics =
    selectTopics(rankedTopics);

  // Stage 8: verify that selected topics contain
  // enough actual evidence for grounded generation.
  const evidenceCheckedTopics =
    filterEvidence(selectedTopics);

  return evidenceCheckedTopics;
}