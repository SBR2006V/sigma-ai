import { NextResponse } from "next/server";
import { discoverTopics } from "@/lib/discovery";

export async function GET() {
  try {
    const topics = await discoverTopics();

    return NextResponse.json({
      count: topics.length,
      topics,
    });
  } catch (error) {
    console.error("Discovery test failed:", error);

    return NextResponse.json(
      {
        error: "Discovery failed",
      },
      { status: 500 }
    );
  }
}