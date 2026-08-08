import { prisma } from "@/lib/db";
import { discoverTopics } from "@/lib/discovery";
import { generateTopicContent } from "@/lib/discovery/generator";

const RUN_INTERVAL_MS = 20 * 60 * 1000;
const SHORT_TERM_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type AgentRunResult = {
  runId: string;
  agentId: string;
  status: "COMPLETED" | "FAILED";
  discovered: number;
  rejected: number;
  held: number;
  published: number;
  selectedTitle?: string;
  error?: string;
};

function canonicalizeTopicKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function buildWhySelected(topic: {
  editorial: {
    score: number;
    reasons: string[];
  };
  selection: {
    reason: string;
  };
  evidence: {
    decision: string;
    reason: string;
    evidenceScore: number;
  };
}): string {
  return [
    `Editorial score: ${topic.editorial.score}/100.`,
    `Selection: ${topic.selection.reason}.`,
    `Evidence: ${topic.evidence.reason} (${topic.evidence.evidenceScore}).`,
    topic.editorial.reasons.length > 0
      ? `Editorial signals: ${topic.editorial.reasons.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildWhyNow(topic: {
  publishedAt?: Date | null;
  materialDelta?: {
    decision: string;
    reason: string;
  } | null;
}): string {
  const parts: string[] = [];

  if (topic.publishedAt) {
    parts.push(
      `Published ${topic.publishedAt.toISOString()}.`,
    );
  }

  if (topic.materialDelta) {
    parts.push(
      `Material-delta status: ${topic.materialDelta.decision}.`,
    );

    if (topic.materialDelta.reason) {
      parts.push(
        `Reason: ${topic.materialDelta.reason}.`,
      );
    }
  }

  parts.push(
    "Selected from the current discovery cycle based on freshness, relevance, editorial score, and available evidence.",
  );

  return parts.join(" ");
}

export async function runAgent(
  agentId: string,
): Promise<AgentRunResult> {
  const agent = await prisma.agent.findUnique({
    where: {
      id: agentId,
    },
  });

  if (!agent) {
    throw new Error("Agent not found");
  }

  if (agent.status !== "ACTIVE") {
    throw new Error(
      `Agent is not active: ${agent.status}`,
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      agentId,
      status: "RUNNING",
    },
  });

  try {
    await prisma.activityLog.create({
      data: {
        agentId,
        runId: run.id,
        type: "DISCOVERY_STARTED",
        message: "Agent discovery cycle started.",
      },
    });

    const discoveredTopics = await discoverTopics();

    await prisma.activityLog.create({
      data: {
        agentId,
        runId: run.id,
        type: "DISCOVERY_COMPLETED",
        message: `Discovery completed with ${discoveredTopics.length} candidates.`,
        metadata: JSON.parse(
          JSON.stringify({
            count: discoveredTopics.length,
          }),
        ),
      },
    });

    let rejected = 0;
    let held = 0;
    let published = 0;

    /*
     * Persist every discovered candidate as a Topic.
     *
     * We intentionally do this before generation so the database
     * has a durable record of what the agent saw during this run.
     */
    const persistedTopics: Array<{
      topic: (typeof discoveredTopics)[number];
      topicId: string;
    }> = [];

    for (const candidate of discoveredTopics) {
      const topicKey = canonicalizeTopicKey(
        candidate.title,
      );

      const status =
        candidate.selection.decision === "REJECTED"
          ? "REJECTED"
          : candidate.selection.decision === "HELD"
            ? "HELD"
            : candidate.evidence.decision === "INSUFFICIENT"
              ? "HELD"
              : "DISCOVERED";

      if (status === "REJECTED") {
        rejected++;
      }

      if (status === "HELD") {
        held++;
      }

      const topic = await prisma.topic.upsert({
        where: {
          agentId_canonicalKey: {
            agentId,
            canonicalKey: topicKey,
          },
        },
        update: {
          title: candidate.title,
          summary: candidate.summary || null,
          url: candidate.url,
          sourceName: candidate.sourceName,
          sourceType: candidate.sourceType,
          publishedAt: candidate.publishedAt,
          lastSeenAt: new Date(),
          editorialScore: candidate.editorial.score,
          status,
          decisionReason:
            candidate.selection.reason,
        },
        create: {
          agentId,
          canonicalKey: topicKey,
          title: candidate.title,
          summary: candidate.summary || null,
          url: candidate.url,
          sourceName: candidate.sourceName,
          sourceType: candidate.sourceType,
          publishedAt: candidate.publishedAt,
          editorialScore: candidate.editorial.score,
          status,
          decisionReason:
            candidate.selection.reason,
        },
      });

      persistedTopics.push({
        topic: candidate,
        topicId: topic.id,
      });

      if (status === "REJECTED") {
        await prisma.activityLog.create({
          data: {
            agentId,
            topicId: topic.id,
            runId: run.id,
            type: "TOPIC_REJECTED",
            message: candidate.selection.reason,
            score: candidate.editorial.score,
          },
        });
      } else if (status === "HELD") {
        await prisma.activityLog.create({
          data: {
            agentId,
            topicId: topic.id,
            runId: run.id,
            type: "TOPIC_HELD",
            message:
              candidate.evidence.decision ===
              "INSUFFICIENT"
                ? `Held because evidence was insufficient: ${candidate.evidence.reason}`
                : candidate.selection.reason,
            score: candidate.editorial.score,
          },
        });
      }
    }

    /*
     * Only candidates that are:
     *
     * 1. SELECTED
     * 2. backed by SUFFICIENT evidence
     *
     * can reach Groq.
     */
    const generationCandidates =
      persistedTopics
        .filter(
          ({ topic }) =>
            topic.selection.decision ===
              "SELECTED" &&
            topic.evidence.decision ===
              "SUFFICIENT",
        )
        .sort(
          (a, b) =>
            b.topic.editorial.score -
            a.topic.editorial.score,
        );

    if (generationCandidates.length === 0) {
      const completedAt = new Date();

      await prisma.agentRun.update({
        where: {
          id: run.id,
        },
        data: {
          status: "COMPLETED",
          completedAt,
          topicsDiscovered:
            discoveredTopics.length,
          topicsRejected: rejected,
          topicsHeld: held,
          topicsPublished: 0,
        },
      });

      await prisma.agent.update({
        where: {
          id: agentId,
        },
        data: {
          lastRunAt: completedAt,
          lastRunStatus: "SUCCESS_NO_PUBLISH",
          nextRunAt: new Date(
            Date.now() + RUN_INTERVAL_MS,
          ),
        },
      });

      await prisma.activityLog.create({
        data: {
          agentId,
          runId: run.id,
          type: "RUN_COMPLETED",
          message:
            "Run completed. No candidate had sufficient evidence for publication.",
          metadata: JSON.parse(
            JSON.stringify({
              discovered: discoveredTopics.length,
              rejected,
              held,
              published: 0,
            }),
          ),
        },
      });

      return {
        runId: run.id,
        agentId,
        status: "COMPLETED",
        discovered: discoveredTopics.length,
        rejected,
        held,
        published: 0,
      };
    }

    /*
     * MVP policy:
     * Generate and publish only the highest-ranked candidate.
     */
    const selected = generationCandidates[0];
    const topic = selected.topic;

    await prisma.activityLog.create({
      data: {
        agentId,
        topicId: selected.topicId,
        runId: run.id,
        type: "TOPIC_SELECTED",
        message:
          "Candidate selected for generation.",
        score: topic.editorial.score,
        metadata: JSON.parse(
          JSON.stringify({
            rank: topic.selection.rank,
            selectionReason:
              topic.selection.reason,
            evidence:
              topic.evidence,
          }),
        ),
      },
    });

    const generated =
      await generateTopicContent(topic);

    await prisma.activityLog.create({
      data: {
        agentId,
        topicId: selected.topicId,
        runId: run.id,
        type: "POST_GENERATED",
        message:
          "Editorial content generated successfully.",
        score: topic.editorial.score,
      },
    });

    const whySelected =
      buildWhySelected(topic);

    const whyNow =
      buildWhyNow(topic);

    /*
     * Create the Post first, then link the Memory to it.
     */
    const post = await prisma.post.create({
      data: {
        agentId,
        topicId: selected.topicId,
        title: topic.title,
        text: generated.fullPost,
        rationale:
          generated.editorialOpinion,
        whySelected,
        whyNow,
        sources: JSON.parse(
          JSON.stringify([
            {
              title: topic.title,
              url: topic.url,
              sourceName: topic.sourceName,
            },
          ]),
        ),
      },
    });

    const now = new Date();

    const memory = await prisma.memory.create({
      data: {
        agentId,
        topicId: selected.topicId,
        postId: post.id,
        tier: "SHORT_TERM",
        topicKey: canonicalizeTopicKey(
          topic.title,
        ),
        summary: generated.summary,
        importantPoints: JSON.parse(
          JSON.stringify(
            generated.importantPoints,
          ),
        ),
        keywords: JSON.parse(
          JSON.stringify(
            generated.keywords,
          ),
        ),
        editorialOpinion:
          generated.editorialOpinion,
        fullPost: generated.fullPost,
        sources: JSON.parse(
          JSON.stringify([
            {
              title: topic.title,
              url: topic.url,
              sourceName: topic.sourceName,
            },
          ]),
        ),
        decision: "PUBLISHED",
        entities: [
          ...topic.entities.known,
          ...topic.entities.patterns,
        ],
        entitiesRaw: JSON.parse(
          JSON.stringify(topic.entities),
        ),
        lastSeenAt: now,
        lastPublishedAt: now,
        expiresAt: new Date(
          now.getTime() +
            SHORT_TERM_EXPIRY_MS,
        ),
      },
    });

    await prisma.topic.update({
      where: {
        id: selected.topicId,
      },
      data: {
        status: "PUBLISHED",
        decisionReason:
          "Selected, evidence-checked, generated, and published.",
      },
    });

    await prisma.activityLog.create({
      data: {
        agentId,
        topicId: selected.topicId,
        runId: run.id,
        type: "MEMORY_CREATED",
        message:
          "Short-term memory created for published topic.",
        metadata: JSON.parse(
          JSON.stringify({
            memoryId: memory.id,
            postId: post.id,
          }),
        ),
      },
    });

    await prisma.activityLog.create({
      data: {
        agentId,
        topicId: selected.topicId,
        runId: run.id,
        type: "POST_PUBLISHED",
        message:
          "Generated post published to the agent feed.",
        score: topic.editorial.score,
        metadata: JSON.parse(
          JSON.stringify({
            postId: post.id,
            memoryId: memory.id,
          }),
        ),
      },
    });

    published = 1;

    const completedAt = new Date();

    await prisma.agentRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "COMPLETED",
        completedAt,
        topicsDiscovered:
          discoveredTopics.length,
        topicsRejected: rejected,
        topicsHeld: held,
        topicsPublished: published,
      },
    });

    await prisma.agent.update({
      where: {
        id: agentId,
      },
      data: {
        lastRunAt: completedAt,
        lastRunStatus: "SUCCESS_PUBLISHED",
        nextRunAt: new Date(
          Date.now() + RUN_INTERVAL_MS,
        ),
      },
    });

    await prisma.activityLog.create({
      data: {
        agentId,
        runId: run.id,
        type: "RUN_COMPLETED",
        message:
          "Agent run completed successfully with one published post.",
        metadata: JSON.parse(
          JSON.stringify({
            discovered: discoveredTopics.length,
            rejected,
            held,
            published,
            postId: post.id,
            memoryId: memory.id,
          }),
        ),
      },
    });

    return {
      runId: run.id,
      agentId,
      status: "COMPLETED",
      discovered: discoveredTopics.length,
      rejected,
      held,
      published,
      selectedTitle: topic.title,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await prisma.agentRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: message,
      },
    });

    await prisma.agent.update({
      where: {
        id: agentId,
      },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: "FAILED",
      },
    });

    await prisma.activityLog.create({
      data: {
        agentId,
        runId: run.id,
        type: "RUN_FAILED",
        message: `Agent run failed: ${message}`,
      },
    });

    return {
      runId: run.id,
      agentId,
      status: "FAILED",
      discovered: 0,
      rejected: 0,
      held: 0,
      published: 0,
      error: message,
    };
  }
}