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
        { status: 400 }
      );
    }

    const { agentId } = result.data;

    const posts = await prisma.post.findMany({
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
      },
    });

    return NextResponse.json({
      posts,
    });
  } catch (error) {
    console.error("Feed retrieval failed:", error);

    return NextResponse.json(
      {
        error: "Failed to retrieve feed",
      },
      { status: 500 }
    );
  }
}