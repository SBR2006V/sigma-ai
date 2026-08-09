import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverTopics } from "@/lib/discovery";

const querySchema = z.object({
  agentId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const result = querySchema.safeParse({
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

    const topics = await discoverTopics(
      result.data.agentId,
    );

    return NextResponse.json({
      count: topics.length,
      topics,
    });
  } catch (error) {
    console.error(
      "Discovery test failed:",
      error,
    );

    return NextResponse.json(
      {
        error: "Discovery failed",
      },
      { status: 500 },
    );
  }
}