import { prisma } from "@/lib/db";
import type { EnrichedTopic } from "./entities";
import type { RawTopic } from "./rss";

const TITLE_DUPLICATE_THRESHOLD = 0.55;
const ENTITY_TITLE_THRESHOLD = 0.15;
const MEMORY_WINDOW_MS = 24 * 60 * 60 * 1000;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "says",
  "said",
  "about",
  "into",
  "over",
  "after",
  "before",
  "their",
  "they",
  "will",
  "has",
  "have",
  "was",
  "are",
  "its",
  "how",
  "why",
  "what",
  "when",
  "where",
  "who",
  "new",
]);

export type DedupeDecision =
  | "UNIQUE"
  | "IN_BATCH_DUPLICATE"
  | "CROSS_RUN_DUPLICATE"
  | "FOLLOW_UP_CANDIDATE";

export type DedupeResult<T> = {
  topic: T;
  decision: DedupeDecision;
  duplicateOf?: string;
  reason?: string;
};

export type DedupedTopic = EnrichedTopic & {
  dedupe: {
    decision: DedupeDecision;
    duplicateOf?: string;
    reason?: string;
  };
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]\(https?:\/\/[^)]+\)/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase();
}

function getWords(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter(
        (word) =>
          word.length >= 4 &&
          !STOP_WORDS.has(word),
      ),
  );
}

function titleSimilarity(
  a: RawTopic,
  b: RawTopic,
): number {
  const wordsA = getWords(a.title);
  const wordsB = getWords(b.title);

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  const union = new Set([
    ...wordsA,
    ...wordsB,
  ]).size;

  return union === 0
    ? 0
    : intersection / union;
}

function sharedEntities(
  a: EnrichedTopic,
  b: EnrichedTopic,
): string[] {
  const aEntities = new Set([
    ...a.entities.known,
    ...a.entities.patterns,
  ]);

  const bEntities = new Set([
    ...b.entities.known,
    ...b.entities.patterns,
  ]);

  return [...aEntities].filter((entity) =>
    bEntities.has(entity),
  );
}

function isSameStory(
  a: EnrichedTopic,
  b: EnrichedTopic,
): {
  duplicate: boolean;
  reason: string;
  similarity: number;
  sharedEntities: string[];
} {
  /*
   * Exact URL match is the strongest possible
   * duplicate signal within the current discovery batch.
   */
  const sameUrl =
    normalizeUrl(a.url) ===
    normalizeUrl(b.url);

  if (sameUrl) {
    return {
      duplicate: true,
      reason: "exact_url_match",
      similarity: 1,
      sharedEntities: [],
    };
  }

  const similarity = titleSimilarity(a, b);
  const entities = sharedEntities(a, b);

  /*
   * Two or more shared entities are a strong
   * cross-source story anchor.
   */
  if (entities.length >= 2) {
    return {
      duplicate: true,
      reason: "multiple_shared_entities",
      similarity,
      sharedEntities: entities,
    };
  }

  /*
   * A single shared entity is not enough by itself.
   * Require some title similarity to avoid merging
   * unrelated stories about the same company/model.
   */
  if (
    entities.length === 1 &&
    similarity >= ENTITY_TITLE_THRESHOLD
  ) {
    return {
      duplicate: true,
      reason:
        "shared_entity_and_title_similarity",
      similarity,
      sharedEntities: entities,
    };
  }

  /*
   * Near-identical titles are enough even without
   * recognized entities.
   */
  if (
    similarity >= TITLE_DUPLICATE_THRESHOLD
  ) {
    return {
      duplicate: true,
      reason: "high_title_similarity",
      similarity,
      sharedEntities: entities,
    };
  }

  return {
    duplicate: false,
    reason: "no_duplicate_signal",
    similarity,
    sharedEntities: entities,
  };
}

function sourceCredibility(
  sourceType?: string | null,
): number {
  if (sourceType === "PRIMARY") {
    return 1;
  }

  return 0.5;
}

function isBetterTopic(
  a: EnrichedTopic,
  b: EnrichedTopic,
): boolean {
  const credibilityA =
    sourceCredibility(a.sourceType);

  const credibilityB =
    sourceCredibility(b.sourceType);

  if (credibilityA !== credibilityB) {
    return credibilityA > credibilityB;
  }

  const entitiesA =
    a.entities.known.length +
    a.entities.patterns.length;

  const entitiesB =
    b.entities.known.length +
    b.entities.patterns.length;

  if (entitiesA !== entitiesB) {
    return entitiesA > entitiesB;
  }

  return (
    (a.publishedAt?.getTime() ?? 0) >
    (b.publishedAt?.getTime() ?? 0)
  );
}

function getTopicEntities(
  topic: EnrichedTopic,
): string[] {
  /*
   * Known entities are strong.
   * Pattern entities are weaker but still useful.
   *
   * Capitalized fallback entities are deliberately
   * excluded from cross-run matching because they
   * are heuristic guesses.
   */
  return [
    ...topic.entities.known,
    ...topic.entities.patterns,
  ];
}

function extractMemoryEntities(memory: {
  entities: string[];
  entitiesRaw: unknown;
}): string[] {
  if (memory.entities.length > 0) {
    return memory.entities;
  }

  /*
   * Backward compatibility for Memory rows created
   * before the flattened entities field existed.
   */
  if (
    memory.entitiesRaw &&
    typeof memory.entitiesRaw === "object"
  ) {
    const raw = memory.entitiesRaw as {
      known?: unknown;
      patterns?: unknown;
    };

    const known = Array.isArray(raw.known)
      ? raw.known.filter(
          (
            value,
          ): value is string =>
            typeof value === "string",
        )
      : [];

    const patterns = Array.isArray(
      raw.patterns,
    )
      ? raw.patterns.filter(
          (
            value,
          ): value is string =>
            typeof value === "string",
        )
      : [];

    return [...known, ...patterns];
  }

  return [];
}

function memorySharedEntities(
  topic: EnrichedTopic,
  memory: {
    entities: string[];
    entitiesRaw: unknown;
  },
): string[] {
  const topicEntities = new Set(
    getTopicEntities(topic),
  );

  return extractMemoryEntities(memory).filter(
    (entity) =>
      topicEntities.has(entity),
  );
}

function memoryTitleLikeSimilarity(
  topic: EnrichedTopic,
  memory: {
    summary: string;
    topicKey: string;
  },
): number {
  /*
   * Memory currently stores summary/topicKey
   * rather than a dedicated title field.
   *
   * Compare the candidate title against both.
   */
  const candidateWords = getWords(
    topic.title,
  );

  const memoryText =
    `${memory.topicKey} ${memory.summary}`;

  const memoryWords = getWords(memoryText);

  if (
    candidateWords.size === 0 ||
    memoryWords.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (const word of candidateWords) {
    if (memoryWords.has(word)) {
      intersection++;
    }
  }

  const union = new Set([
    ...candidateWords,
    ...memoryWords,
  ]).size;

  return union === 0
    ? 0
    : intersection / union;
}

type MemorySource = {
  url?: unknown;
  title?: unknown;
  sourceName?: unknown;
};

function hasExactMemoryUrl(
  candidateUrl: string,
  memorySources: unknown,
): boolean {
  if (
    !candidateUrl ||
    !Array.isArray(memorySources)
  ) {
    return false;
  }

  return memorySources.some(
    (source: unknown) => {
      if (
        !source ||
        typeof source !== "object"
      ) {
        return false;
      }

      const value =
        source as MemorySource;

      return (
        typeof value.url === "string" &&
        normalizeUrl(value.url) ===
          candidateUrl
      );
    },
  );
}

async function findMemoryMatches(
  topic: EnrichedTopic,
  agentId: string,
): Promise<{
  memoryId: string;
  decision:
    | "DUPLICATE"
    | "FOLLOW_UP";
  reason: string;
  sharedEntities: string[];
  similarity: number;
} | null> {
  const cutoff = new Date(
    Date.now() - MEMORY_WINDOW_MS,
  );

  const candidateUrl =
    normalizeUrl(topic.url);

  /*
   * ============================================================
   * PASS 1: EXACT URL HISTORY
   * ============================================================
   *
   * Exact URL history is checked independently from
   * short-term memory.
   *
   * If this agent has already published this exact
   * article URL, it must never be published again
   * simply because the short-term memory expired.
   *
   * We intentionally do NOT filter by expiresAt
   * or createdAt here.
   */
  const exactUrlMemories =
    await prisma.memory.findMany({
      where: {
        agentId,
      },
      select: {
        id: true,
        entities: true,
        entitiesRaw: true,
        sources: true,
        lastPublishedAt: true,
      },
      orderBy: {
        lastPublishedAt: "desc",
      },
      take: 500,
    });

  for (const memory of exactUrlMemories) {
    if (
      hasExactMemoryUrl(
        candidateUrl,
        memory.sources,
      )
    ) {
      return {
  memoryId: memory.id,
  decision: "FOLLOW_UP",
  reason: "memory_exact_url_match",
  sharedEntities: [],
  similarity: 1,
};
    }
  }

  /*
   * ============================================================
   * PASS 2: RECENT MEMORY FOR FUZZY MATCHING
   * ============================================================
   *
   * Fuzzy matching remains limited to recent memory.
   * This prevents an old story from permanently blocking
   * legitimate future coverage.
   */
  const memories =
    await prisma.memory.findMany({
      where: {
        agentId,
        expiresAt: {
          gt: new Date(),
        },
        createdAt: {
          gte: cutoff,
        },
      },
      select: {
        id: true,
        summary: true,
        topicKey: true,
        entities: true,
        entitiesRaw: true,
        sources: true,
        decision: true,
        lastPublishedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });

  /*
   * ============================================================
   * PASS 3: TITLE / ENTITY MATCHING
   * ============================================================
   */
  for (const memory of memories) {
    const shared =
      memorySharedEntities(
        topic,
        memory,
      );

    const similarity =
      memoryTitleLikeSimilarity(
        topic,
        memory,
      );

    /*
     * High title similarity is a hard duplicate.
     */
    if (
      similarity >=
      TITLE_DUPLICATE_THRESHOLD
    ) {
      return {
        memoryId: memory.id,
        decision: "DUPLICATE",
        reason:
          "memory_high_title_similarity",
        sharedEntities: shared,
        similarity,
      };
    }

    /*
     * Shared strong entity + modest title
     * similarity means the topic belongs to
     * the same story family.
     *
     * Material-delta analysis decides whether
     * it is actually a legitimate follow-up.
     */
    if (
      shared.length > 0 &&
      similarity >=
        ENTITY_TITLE_THRESHOLD
    ) {
      return {
        memoryId: memory.id,
        decision: "FOLLOW_UP",
        reason:
          "memory_shared_entity_and_title_similarity",
        sharedEntities: shared,
        similarity,
      };
    }
  }

  return null;
}

async function dedupeInBatch(
  topics: EnrichedTopic[],
): Promise<EnrichedTopic[]> {
  const result: EnrichedTopic[] = [];

  for (const topic of topics) {
    const duplicateIndex =
      result.findIndex(
        (existing) =>
          isSameStory(
            existing,
            topic,
          ).duplicate,
      );

    if (duplicateIndex === -1) {
      result.push(topic);
      continue;
    }

    const existing =
      result[duplicateIndex];

    /*
     * If two sources report the same story,
     * keep the better source.
     */
    if (
      isBetterTopic(
        topic,
        existing,
      )
    ) {
      result[duplicateIndex] =
        topic;
    }
  }

  return result;
}

export async function dedupeTopics(
  topics: EnrichedTopic[],
  agentId: string,
): Promise<DedupedTopic[]> {
  /*
   * ============================================================
   * STAGE 1
   * ============================================================
   *
   * Cross-source and in-batch deduplication.
   */
  const uniqueBatch =
    await dedupeInBatch(topics);

  const result: DedupedTopic[] = [];

  /*
   * ============================================================
   * STAGE 2
   * ============================================================
   *
   * Cross-run memory deduplication.
   */
  for (const topic of uniqueBatch) {
    const memoryMatch =
      await findMemoryMatches(
        topic,
        agentId,
      );

    /*
     * No previous memory match.
     *
     * This is a genuinely new candidate.
     */
    if (!memoryMatch) {
      result.push({
        ...topic,
        dedupe: {
          decision: "UNIQUE",
          reason: "no_memory_match",
        },
      });

      continue;
    }

    /*
     * Hard duplicate.
     *
     * Do not send it through the expensive
     * editorial/evidence/generation pipeline.
     */
    if (
      memoryMatch.decision ===
      "DUPLICATE"
    ) {
      continue;
    }

    /*
     * Same story family but potentially new
     * information.
     *
     * Keep it alive so the material-delta
     * stage can decide whether it is a real
     * follow-up.
     */
    result.push({
      ...topic,
      dedupe: {
        decision:
          "FOLLOW_UP_CANDIDATE",
        duplicateOf:
          memoryMatch.memoryId,
        reason:
          memoryMatch.reason,
      },
    });
  }

  return result;
}