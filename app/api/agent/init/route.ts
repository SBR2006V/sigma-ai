import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const initSchema = z.object({
  persona: z.object({
    name: z.string().trim().min(1).max(100),
    domain: z.string().trim().min(1).max(100),
  }),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = initSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid initialization request",
        },
        { status: 400 }
      );
    }

    const { name, domain } = result.data.persona;

    const agent = await prisma.agent.create({
      data: {
        name,
        domain,
        status: "ACTIVE",
        initializedAt: new Date(),
        nextRunAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        agentId: agent.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Agent initialization failed:", error);

    return NextResponse.json(
      {
        error: "Failed to initialize agent",
      },
      { status: 500 }
    );
  }
}