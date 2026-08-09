import type { EditorialTopic } from "./editorial";
import type { EvidenceCheckedTopic } from "./evidence";

export type SelectionDecision =
  | "SELECTED"
  | "HELD"
  | "REJECTED";

export type SelectedTopic = EvidenceCheckedTopic & {
  selection: {
    decision: SelectionDecision;
    rank: number;
    reason: string;
  };
};

const MIN_EDITORIAL_SCORE = 55;

function getSelectionReason(
  topic: EditorialTopic,
): string {
  const reasons: string[] = [];

  if (topic.editorial.score >= 70) {
    reasons.push("high editorial score");
  } else if (topic.editorial.score >= 55) {
    reasons.push("moderate editorial score");
  } else {
    reasons.push("low editorial score");
  }

  if (topic.sourceType === "PRIMARY") {
    reasons.push("primary source");
  }

  if (topic.entities.known.length > 0) {
    reasons.push("known entities present");
  }

  if (
    topic.materialDelta &&
    topic.materialDelta.decision ===
      "MATERIAL_DELTA"
  ) {
    reasons.push("materially new information");
  }

  return reasons.join("; ");
}

function getDecision(
  topic: EvidenceCheckedTopic,
): SelectionDecision {
  /*
   * Evidence is checked before selection.
   *
   * A topic with insufficient evidence must never
   * be marked SELECTED for grounded generation.
   */
  if (
    topic.evidence.decision === "INSUFFICIENT"
  ) {
    return "HELD";
  }

  /*
   * Editorial threshold.
   */
  if (
    topic.editorial.score < MIN_EDITORIAL_SCORE
  ) {
    return "REJECTED";
  }

  /*
   * Follow-up candidates require actual material delta.
   */
  if (
    topic.dedupe.decision ===
      "FOLLOW_UP_CANDIDATE" &&
    topic.materialDelta?.decision !==
      "MATERIAL_DELTA"
  ) {
    return "HELD";
  }

  return "SELECTED";
}

function getHeldReason(
  topic: EvidenceCheckedTopic,
): string {
  if (
    topic.evidence.decision === "INSUFFICIENT"
  ) {
    return `insufficient evidence: ${topic.evidence.reason}`;
  }

  if (
    topic.dedupe.decision ===
      "FOLLOW_UP_CANDIDATE" &&
    topic.materialDelta?.decision !==
      "MATERIAL_DELTA"
  ) {
    return "follow-up requires material delta";
  }

  return "held for further review";
}

export function selectTopics(
  topics: EvidenceCheckedTopic[],
): SelectedTopic[] {
  const ranked = [...topics].sort(
    (a, b) =>
      b.editorial.score -
      a.editorial.score,
  );

  return ranked.map((topic, index) => {
    const decision = getDecision(topic);

    return {
      ...topic,
      selection: {
        decision,
        rank: index + 1,
        reason:
          decision === "REJECTED"
            ? `editorial score below ${MIN_EDITORIAL_SCORE}`
            : decision === "HELD"
              ? getHeldReason(topic)
              : getSelectionReason(topic),
      },
    };
  });
}