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

function titleSimilarity(a: RawTopic, b: RawTopic): number {
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

  const union = new Set([...wordsA, ...wordsB]).size;

  return union === 0 ? 0 : intersection / union;
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

  return [...aEntities].filter((entity) => bEntities.has(entity));
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
  const sameUrl =
    a.url.trim().toLowerCase() ===
    b.url.trim().toLowerCase();

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
   * Strong rule:
   *
   * Same strong entity + modest title similarity.
   *
   * This handles cross-source rewrites:
   *
   * OpenAI + Astra
   *
   * appearing in OpenAI and TechCrunch with different wording.
   */
  // Two or more shared entities are a strong cross-source story anchor.
// This is especially important when different publishers use very
// different headlines for the same event.
if (entities.length >= 2) {
  return {
    duplicate: true,
    reason: "multiple_shared_entities",
    similarity,
    sharedEntities: entities,
  };
}

// A single shared entity is not enough by itself.
// Require some title similarity to avoid merging unrelated stories
// about the same company/model/platform.
if (
  entities.length === 1 &&
  similarity >= ENTITY_TITLE_THRESHOLD
) {
  return {
    duplicate: true,
    reason: "shared_entity_and_title_similarity",
    similarity,
    sharedEntities: entities,
  };
}

  /*
   * Near-identical titles are enough even without entities.
   */
  if (similarity >= TITLE_DUPLICATE_THRESHOLD) {
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

function sourceCredibility(sourceType?: string | null): number {
  if (sourceType === "PRIMARY") {
    return 1;
  }

  return 0.5;
}

function isBetterTopic(
  a: EnrichedTopic,
  b: EnrichedTopic,
): boolean {
  const credibilityA = sourceCredibility(a.sourceType);
  const credibilityB = sourceCredibility(b.sourceType);

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

function getTopicEntities(topic: EnrichedTopic): string[] {
  /*
   * Known entities are strong.
   * Pattern entities are weaker but still useful.
   * Capitalized fallback entities are deliberately excluded from
   * cross-run matching because they are heuristic guesses.
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
   * Backward compatibility for Memory rows created before entities
   * were introduced.
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
          (value): value is string =>
            typeof value === "string",
        )
      : [];

    const patterns = Array.isArray(raw.patterns)
      ? raw.patterns.filter(
          (value): value is string =>
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
    (entity) => topicEntities.has(entity),
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
   * Memory currently stores summary/topicKey rather than a dedicated
   * title field. Compare the candidate title against both.
   */
  const candidateWords = getWords(topic.title);

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

  return union === 0 ? 0 : intersection / union;
}

async function findMemoryMatches(
  topic: EnrichedTopic,
): Promise<{
  memoryId: string;
  decision: "DUPLICATE" | "FOLLOW_UP";
  reason: string;
  sharedEntities: string[];
  similarity: number;
} | null> {
  const cutoff = new Date(
    Date.now() - MEMORY_WINDOW_MS,
  );

  const candidateEntities = getTopicEntities(topic);

  /*
   * First query by entity because this is exactly what the GIN index
   * is intended to support.
   *
   * If there are no entities, fall back to recent memory rows for
   * title comparison.
   */
  const memories =
    candidateEntities.length > 0
      ? await prisma.memory.findMany({
          where: {
            expiresAt: {
              gt: new Date(),
            },
            createdAt: {
              gte: cutoff,
            },
            entities: {
              hasSome: candidateEntities,
            },
          },
          select: {
            id: true,
            summary: true,
            topicKey: true,
            entities: true,
            entitiesRaw: true,
            decision: true,
            lastPublishedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        })
      : await prisma.memory.findMany({
          where: {
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
            decision: true,
            lastPublishedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        });

  for (const memory of memories) {
    const shared = memorySharedEntities(
      topic,
      memory,
    );

    const similarity =
      memoryTitleLikeSimilarity(topic, memory);

    /*
     * Exact/high similarity is a duplicate regardless of whether
     * there are strong entities.
     */
    if (similarity >= TITLE_DUPLICATE_THRESHOLD) {
      return {
        memoryId: memory.id,
        decision: "DUPLICATE",
        reason: "memory_high_title_similarity",
        sharedEntities: shared,
        similarity,
      };
    }

    /*
     * Shared strong entity + modest similarity means this is the
     * same story family.
     *
     * It may be a duplicate or a legitimate follow-up. The editorial
     * stage will make that final determination.
     */
    if (
      shared.length > 0 &&
      similarity >= ENTITY_TITLE_THRESHOLD
    ) {
      return {
        memoryId: memory.id,
        decision: "FOLLOW_UP",
        reason: "memory_shared_entity_and_title_similarity",
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
    const duplicateIndex = result.findIndex(
      (existing) =>
        isSameStory(existing, topic).duplicate,
    );

    if (duplicateIndex === -1) {
      result.push(topic);
      continue;
    }

    const existing = result[duplicateIndex];

    if (isBetterTopic(topic, existing)) {
      result[duplicateIndex] = topic;
    }
  }

  return result;
}

export async function dedupeTopics(
  topics: EnrichedTopic[],
): Promise<DedupedTopic[]> {
  /*
   * Stage 1:
   * Cross-source/in-batch deduplication.
   */
  const uniqueBatch = await dedupeInBatch(topics);

  const result: DedupedTopic[] = [];

  /*
   * Stage 2:
   * Cross-run memory deduplication.
   */
  for (const topic of uniqueBatch) {
    const memoryMatch =
      await findMemoryMatches(topic);

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

    if (memoryMatch.decision === "DUPLICATE") {
      /*
       * Hard duplicate.
       *
       * Do not send it further down the expensive pipeline.
       */
      continue;
    }

    /*
     * Same story family but potentially new information.
     *
     * Keep it alive and explicitly mark it so editorial judgment can
     * determine whether there is a genuine delta.
     */
    result.push({
      ...topic,
      dedupe: {
        decision: "FOLLOW_UP_CANDIDATE",
        duplicateOf: memoryMatch.memoryId,
        reason: memoryMatch.reason,
      },
    });
  }

  return result;
}