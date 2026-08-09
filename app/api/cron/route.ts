import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(
      `${new URL(request.url).origin}/api/agent/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: process.env.SIGMA_AGENT_ID,
        }),
        cache: "no-store",
      },
    );

    const result = await response.json();

    return NextResponse.json({
      ok: response.ok,
      triggered: true,
      result,
    });
  } catch (error) {
    console.error("Cron execution failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Cron execution failed",
      },
      { status: 500 },
    );
  }
}