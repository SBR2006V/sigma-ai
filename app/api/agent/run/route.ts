import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent/runner";

const runSchema = z.object({
  agentId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = runSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid or missing agentId",
        },
        { status: 400 },
      );
    }

    const resultData = await runAgent(
      result.data.agentId,
    );

    return NextResponse.json(resultData);
  } catch (error) {
    console.error("Agent run failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run agent",
      },
      { status: 500 },
    );
  }
}