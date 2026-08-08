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
      .split(" ")
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
  const candidateWords =
    getWords(candidate);

  const memoryWords =
    getWords(memory);

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
    ...topic.entities.known,
    ...topic.entities.patterns,
  ];
}

function extractNewWords(
  candidate: string,
  memory: string,
): string[] {
  const candidateWords =
    getWords(candidate);

  const memoryWords =
    getWords(memory);

  return [...candidateWords].filter(
    (word) => !memoryWords.has(word),
  );
}

export async function evaluateMaterialDelta(
  topic: DedupedTopic,
): Promise<MaterialDeltaResult> {
  /*
   * A UNIQUE topic has no previous memory to compare
   * against. It is therefore treated as material by
   * default and continues through the pipeline.
   */
  if (
    topic.dedupe.decision !==
      "FOLLOW_UP_CANDIDATE" ||
    !topic.dedupe.duplicateOf
  ) {
    return {
      decision: "MATERIAL_DELTA",
      reason: "not_a_follow_up_candidate",
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
        fullPost: true,
        entities: true,
        entitiesRaw: true,
        createdAt: true,
        lastPublishedAt: true,
      },
    });

  /*
   * The memory may have disappeared between the
   * dedupe query and this comparison. In that case,
   * don't discard the topic.
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

  const candidateText = [
    topic.title,
    topic.summary,
  ].join(" ");

  const memoryText = [
    memory.topicKey,
    memory.summary,
    typeof memory.fullPost === "string"
      ? memory.fullPost
      : "",
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

  const candidateEntities =
    new Set(getTopicEntities(topic));

  const memoryEntities =
    new Set(memory.entities);

  const newEntities =
    [...candidateEntities].filter(
      (entity) =>
        !memoryEntities.has(entity),
    );

  /*
   * A follow-up is materially new when:
   *
   * 1. It introduces a new entity, OR
   * 2. Its wording contains enough new information
   *    to indicate a substantially different update.
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
  const results: MaterialDeltaTopic[] =
    [];

  for (const topic of topics) {
    const materialDelta =
      await evaluateMaterialDelta(
        topic,
      );

    /*
     * Only remove a topic when we have actually
     * determined that it is a redundant follow-up.
     *
     * UNIQUE topics always receive a MATERIAL_DELTA
     * result and continue.
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