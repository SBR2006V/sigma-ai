import type { MaterialDeltaTopic } from "./material-delta";

export type EditorialScoreBreakdown = {
  source: number;
  entities: number;
  materialDelta: number;
  freshness: number;
  contentQuality: number;
  total: number;
};

export type EditorialTopic = MaterialDeltaTopic & {
  editorial: {
    score: number;
    breakdown: EditorialScoreBreakdown;
    reasons: string[];
  };
};

const MAX_SCORE = 100;
const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

function sourceScore(sourceType?: string | null): number {
  if (sourceType === "PRIMARY") {
    return 25;
  }

  return 12;
}

function entityScore(topic: MaterialDeltaTopic): number {
  const knownCount = topic.entities.known.length;
  const patternCount = topic.entities.patterns.length;

  const knownScore = Math.min(18, knownCount * 6);
  const patternScore = Math.min(6, patternCount * 2);

  return knownScore + patternScore;
}

function materialDeltaScore(
  topic: MaterialDeltaTopic,
): number {
  if (
    topic.materialDelta?.decision ===
    "MATERIAL_DELTA"
  ) {
    return 25;
  }

  return 0;
}

function freshnessScore(
  publishedAt: Date | null | undefined,
): number {
  if (!publishedAt) {
    return 0;
  }

  const age = Date.now() - publishedAt.getTime();

  if (age < 0) {
    return 15;
  }

  if (age >= FRESHNESS_WINDOW_MS) {
    return 0;
  }

  const freshness =
    1 - age / FRESHNESS_WINDOW_MS;

  return Math.round(freshness * 15);
}

function contentQualityScore(
  title: string,
  summary: string,
): number {
  let score = 0;

  const cleanTitle = title.trim();
  const cleanSummary = summary.trim();

  if (cleanTitle.length >= 30) {
    score += 2;
  }

  if (cleanTitle.length >= 50) {
    score += 1;
  }

  if (cleanSummary.length >= 80) {
    score += 2;
  }

  return Math.min(5, score);
}

function buildReasons(
  topic: MaterialDeltaTopic,
  breakdown: EditorialScoreBreakdown,
): string[] {
  const reasons: string[] = [];

  if (topic.sourceType === "PRIMARY") {
    reasons.push("primary source");
  } else {
    reasons.push("secondary source");
  }

  if (topic.entities.known.length > 0) {
    reasons.push(
      `${topic.entities.known.length} known entit${
        topic.entities.known.length === 1
          ? "y"
          : "ies"
      }`,
    );
  }

  if (topic.entities.patterns.length > 0) {
    reasons.push(
      `${topic.entities.patterns.length} detected pattern entit${
        topic.entities.patterns.length === 1
          ? "y"
          : "ies"
      }`,
    );
  }

  if (
    topic.materialDelta?.decision ===
    "MATERIAL_DELTA"
  ) {
    reasons.push(
      topic.materialDelta.reason,
    );
  }

  if (breakdown.freshness >= 12) {
    reasons.push("very recent");
  } else if (breakdown.freshness >= 6) {
    reasons.push("recent");
  }

  if (breakdown.contentQuality >= 4) {
    reasons.push("strong content metadata");
  }

  return reasons;
}

export function scoreEditorialTopic(
  topic: MaterialDeltaTopic,
): EditorialTopic {
  const source = sourceScore(
    topic.sourceType,
  );

  const entities = entityScore(topic);

  const materialDelta =
    materialDeltaScore(topic);

  const freshness = freshnessScore(
    topic.publishedAt,
  );

  const contentQuality =
    contentQualityScore(
      topic.title,
      topic.summary,
    );

  const total = Math.min(
    MAX_SCORE,
    source +
      entities +
      materialDelta +
      freshness +
      contentQuality,
  );

  const breakdown: EditorialScoreBreakdown = {
    source,
    entities,
    materialDelta,
    freshness,
    contentQuality,
    total,
  };

  return {
    ...topic,
    editorial: {
      score: total,
      breakdown,
      reasons: buildReasons(
        topic,
        breakdown,
      ),
    },
  };
}

export function rankEditorialTopics(
  topics: MaterialDeltaTopic[],
): EditorialTopic[] {
  return topics
    .map(scoreEditorialTopic)
    .sort((a, b) => {
      if (
        b.editorial.score !==
        a.editorial.score
      ) {
        return (
          b.editorial.score -
          a.editorial.score
        );
      }

      const publishedA =
        a.publishedAt?.getTime() ?? 0;

      const publishedB =
        b.publishedAt?.getTime() ?? 0;

      return publishedB - publishedA;
    });
}