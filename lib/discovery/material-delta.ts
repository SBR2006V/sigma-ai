import { prisma } from "@/lib/db";
import type { DedupedTopic } from "./dedupe";

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

/*
 * Jaccard similarity below this value means the candidate
 * contains substantially different information.
 */
const MATERIAL_DELTA_THRESHOLD = 0.18;

export type MaterialDeltaDecision =
  | "MATERIAL_DELTA"
  | "NO_MATERIAL_DELTA";

export type MaterialDeltaResult = {
  decision: MaterialDeltaDecision;
  reason: string;
  similarity: number;
  newInformation: string[];
};

export type MaterialDeltaTopic = DedupedTopic & {
  materialDelta: MaterialDeltaResult;
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
      .split(/\s+/)
      .filter(
        (word) =>
          word.length >= 4 &&
          !STOP_WORDS.has(word),
      ),
  );
}

function wordSimilarity(
  candidate: string,
  memory: string,
): number {
  const candidateWords = getWords(candidate);
  const memoryWords = getWords(memory);

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

function getTopicEntities(
  topic: DedupedTopic,
): string[] {
  return [
    ...new Set([
      ...topic.entities.known,
      ...topic.entities.patterns,
    ]),
  ];
}

function normalizeEntity(
  entity: string,
): string {
  return normalizeText(entity);
}

function extractMemoryEntities(memory: {
  entities: string[];
  entitiesRaw: unknown;
}): string[] {
  if (memory.entities.length > 0) {
    return [
      ...new Set(
        memory.entities
          .filter(
            (entity): entity is string =>
              typeof entity === "string",
          )
          .map(normalizeEntity)
          .filter(Boolean),
      ),
    ];
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

    const patterns = Array.isArray(raw.patterns)
      ? raw.patterns.filter(
          (
            value,
          ): value is string =>
            typeof value === "string",
        )
      : [];

    return [
      ...new Set(
        [...known, ...patterns]
          .map(normalizeEntity)
          .filter(Boolean),
      ),
    ];
  }

  return [];
}

function extractNewWords(
  candidate: string,
  memory: string,
): string[] {
  const candidateWords = getWords(candidate);
  const memoryWords = getWords(memory);

  return [...candidateWords].filter(
    (word) => !memoryWords.has(word),
  );
}

function getNewEntities(
  topic: DedupedTopic,
  memory: {
    entities: string[];
    entitiesRaw: unknown;
  },
): string[] {
  const candidateEntities = [
    ...new Set(
      getTopicEntities(topic)
        .map(normalizeEntity)
        .filter(Boolean),
    ),
  ];

  const memoryEntities = new Set(
    extractMemoryEntities(memory),
  );

  return candidateEntities.filter(
    (entity) => !memoryEntities.has(entity),
  );
}

export async function evaluateMaterialDelta(
  topic: DedupedTopic,
): Promise<MaterialDeltaResult> {
  /*
   * UNIQUE topics have no previous memory to compare
   * against. They are therefore considered material
   * by default.
   */
  if (
    topic.dedupe.decision !==
      "FOLLOW_UP_CANDIDATE" ||
    !topic.dedupe.duplicateOf
  ) {
    return {
      decision: "MATERIAL_DELTA",
      reason:
        "not_a_follow_up_candidate",
      similarity: 0,
      newInformation: [],
    };
  }

  const memory =
    await prisma.memory.findUnique({
      where: {
        id: topic.dedupe.duplicateOf,
      },
      select: {
        id: true,
        topicKey: true,
        summary: true,
        importantPoints: true,
        entities: true,
        entitiesRaw: true,
        createdAt: true,
        lastPublishedAt: true,
      },
    });

  /*
   * The memory may have disappeared between
   * dedupe and material-delta evaluation.
   *
   * Do not discard the candidate in that case.
   */
  if (!memory) {
    return {
      decision: "MATERIAL_DELTA",
      reason:
        "matched_memory_no_longer_exists",
      similarity: 0,
      newInformation: [],
    };
  }

  /*
   * IMPORTANT:
   *
   * Compare source-derived candidate information
   * against source-derived memory information.
   *
   * Do NOT include fullPost here because that is
   * generated editorial prose and can distort the
   * similarity calculation.
   */
  const candidateText = [
    topic.title,
    topic.summary,
  ].join(" ");

  const memoryText = [
    memory.topicKey,
    memory.summary,
  ].join(" ");

  const similarity = wordSimilarity(
    candidateText,
    memoryText,
  );

  const newInformation =
    extractNewWords(
      candidateText,
      memoryText,
    );

  const newEntities =
    getNewEntities(
      topic,
      memory,
    );

  /*
   * A follow-up is considered materially new when:
   *
   * 1. It introduces a genuinely new entity, OR
   * 2. Its wording is sufficiently different from
   *    the previous source-derived memory.
   */
  if (newEntities.length > 0) {
    return {
      decision: "MATERIAL_DELTA",
      reason: "new_entities_detected",
      similarity,
      newInformation: [
        ...newEntities,
        ...newInformation.slice(0, 10),
      ],
    };
  }

  if (
    similarity <
    MATERIAL_DELTA_THRESHOLD
  ) {
    return {
      decision: "MATERIAL_DELTA",
      reason:
        "substantial_new_information",
      similarity,
      newInformation:
        newInformation.slice(0, 20),
    };
  }

  return {
    decision: "NO_MATERIAL_DELTA",
    reason:
      "candidate_contains_no_material_new_information",
    similarity,
    newInformation: [],
  };
}

export async function filterMaterialDelta(
  topics: DedupedTopic[],
): Promise<MaterialDeltaTopic[]> {
  const results: MaterialDeltaTopic[] = [];

  for (const topic of topics) {
    const materialDelta =
      await evaluateMaterialDelta(
        topic,
      );

    /*
     * Only remove a topic when it is a follow-up
     * candidate and we have explicitly determined
     * that it contains no material new information.
     *
     * UNIQUE topics always continue.
     */
    if (
      topic.dedupe.decision ===
        "FOLLOW_UP_CANDIDATE" &&
      materialDelta.decision ===
        "NO_MATERIAL_DELTA"
    ) {
      continue;
    }

    results.push({
      ...topic,
      materialDelta,
    });
  }

  return results;
}