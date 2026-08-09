import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const feedQuerySchema = z.object({
  agentId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const result = feedQuerySchema.safeParse({
      agentId: searchParams.get("agentId"),
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid or missing agentId",
        },
        { status: 400 },
      );
    }

    const { agentId } = result.data;

    const [posts, latestRun] = await Promise.all([
      prisma.post.findMany({
        where: {
          agentId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          createdAt: true,
          text: true,
          rationale: true,
          sources: true,
          title: true,
          whySelected: true,
          whyNow: true,
        },
      }),

      prisma.agentRun.findFirst({
        where: {
          agentId,
        },
        orderBy: {
          startedAt: "desc",
        },
        select: {
          id: true,
          agentId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          topicsDiscovered: true,
          topicsRejected: true,
          topicsHeld: true,
          topicsPublished: true,
          errorMessage: true,
        },
      }),
    ]);

    const latestPost = posts[0] ?? null;

    return NextResponse.json({
      posts,
      latestRun: latestRun
        ? {
            runId: latestRun.id,
            agentId: latestRun.agentId,
            status: latestRun.status,
            discovered: latestRun.topicsDiscovered,
            rejected: latestRun.topicsRejected,
            held: latestRun.topicsHeld,
            published: latestRun.topicsPublished,
            selectedTitle: latestPost?.title ?? undefined,
          }
        : null,
    });
  } catch (error) {
    console.error("Feed retrieval failed:", error);

    return NextResponse.json(
      {
        error: "Failed to retrieve feed",
      },
      { status: 500 },
    );
  }
}