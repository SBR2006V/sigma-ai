import type { SelectedTopic } from "./selection";

export type EvidenceDecision =
  | "SUFFICIENT"
  | "INSUFFICIENT";

export type EvidenceResult = {
  decision: EvidenceDecision;
  reason: string;
  evidenceScore: number;
};

export type EvidenceCheckedTopic = SelectedTopic & {
  evidence: EvidenceResult;
};

function isUrlOnly(text: string): boolean {
  const value = text.trim();

  if (!value) {
    return true;
  }

  const withoutUrls = value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .trim();

  return withoutUrls.length === 0;
}

function countWords(text: string): number {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export function evaluateEvidence(
  topic: SelectedTopic,
): EvidenceResult {
  let score = 0;

  const titleWords = countWords(topic.title);
  const summaryWords = countWords(topic.summary);

  // A meaningful title provides some evidence.
  if (titleWords >= 6) {
    score += 2;
  }

  if (titleWords >= 10) {
    score += 1;
  }

  // A real summary is the strongest deterministic signal.
  if (summaryWords >= 15) {
    score += 3;
  }

  if (summaryWords >= 30) {
    score += 2;
  }

  // Primary sources are more trustworthy, but source type
  // alone is never enough to establish sufficient evidence.
  if (topic.sourceType === "PRIMARY") {
    score += 1;
  }

  // Known entities provide additional grounding.
  if (topic.entities.known.length > 0) {
    score += Math.min(2, topic.entities.known.length);
  }

  // A summary containing only a URL is not evidence.
  if (isUrlOnly(topic.summary)) {
    return {
      decision: "INSUFFICIENT",
      reason: "summary_contains_no_substantive_evidence",
      evidenceScore: score,
    };
  }

  // We require actual textual evidence.
  if (summaryWords < 15) {
    return {
      decision: "INSUFFICIENT",
      reason: "summary_too_short_for_grounded_generation",
      evidenceScore: score,
    };
  }

  if (score < 5) {
    return {
      decision: "INSUFFICIENT",
      reason: "insufficient_evidence_score",
      evidenceScore: score,
    };
  }

  return {
    decision: "SUFFICIENT",
    reason: "sufficient_source_evidence",
    evidenceScore: score,
  };
}

export function filterEvidence(
  topics: SelectedTopic[],
): EvidenceCheckedTopic[] {
  return topics.map((topic) => ({
    ...topic,
    evidence: evaluateEvidence(topic),
  }));
}