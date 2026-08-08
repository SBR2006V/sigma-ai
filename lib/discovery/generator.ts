import { groq } from "@/lib/ai/groq";
import type { EditorialTopic } from "./editorial";

export type GeneratedContent = {
  summary: string;
  importantPoints: string[];
  keywords: string[];
  editorialOpinion: string;
  fullPost: string;
};

const MODEL = "llama-3.3-70b-versatile";

function cleanJsonText(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function validateGeneratedContent(
  value: unknown,
): GeneratedContent {
  if (!value || typeof value !== "object") {
    throw new Error("LLM returned invalid content");
  }

  const data = value as Record<string, unknown>;

  if (
    typeof data.summary !== "string" ||
    !Array.isArray(data.importantPoints) ||
    !Array.isArray(data.keywords) ||
    typeof data.editorialOpinion !== "string" ||
    typeof data.fullPost !== "string"
  ) {
    throw new Error(
      "LLM response is missing required content fields",
    );
  }

  return {
    summary: data.summary.trim(),

    importantPoints: data.importantPoints
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),

    keywords: data.keywords
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),

    editorialOpinion: data.editorialOpinion.trim(),

    fullPost: data.fullPost.trim(),
  };
}

export async function generateTopicContent(
  topic: EditorialTopic,
): Promise<GeneratedContent> {
  const prompt = `
You are the editorial intelligence layer of Sigma AI.

Your job is to turn a selected technology/news topic into a concise,
fact-grounded editorial briefing.

IMPORTANT RULES:
- Do not invent facts.
- Do not claim information that is not present in the supplied topic.
- Do not fabricate quotes, statistics, dates, people, companies, or product capabilities.
- Distinguish reported facts from interpretation.
- Be concise and technically accurate.
- Do not mention that you are an AI.
- Do not use marketing language or hype.
- Do not repeat the source URL as part of the content.
- If the source information is insufficient for a strong claim, say so.

TOPIC:
Title: ${topic.title}

Summary:
${topic.summary || "No summary provided."}

Source:
${topic.sourceName} (${topic.sourceType})

Published:
${topic.publishedAt?.toISOString() ?? "Unknown"}

Known entities:
${topic.entities.known.join(", ") || "None"}

Detected patterns:
${topic.entities.patterns.join(", ") || "None"}

Editorial score:
${topic.editorial.score}

Editorial reasons:
${topic.editorial.reasons.join(", ") || "None"}

Material delta:
${topic.materialDelta?.decision ?? "None"}

Material delta reason:
${topic.materialDelta?.reason ?? "None"}

Return ONLY valid JSON with exactly these fields:

{
  "summary": "2-4 sentence factual summary",
  "importantPoints": [
    "important factual point",
    "important factual point",
    "important factual point"
  ],
  "keywords": [
    "keyword",
    "keyword"
  ],
  "editorialOpinion": "A short, balanced editorial interpretation based only on the supplied information.",
  "fullPost": "A concise editorial-style post suitable for the Sigma AI feed."
}

Do not wrap the JSON in markdown fences.
`;

  const completion = await groq.chat.completions.create({
  model: MODEL,
  temperature: 0.2,
  max_tokens: 1200,
  response_format: {
    type: "json_object",
  },
  messages: [
      {
        role: "system",
        content:
          "You are a careful technology news editor. Output only valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content =
    completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response");
  }

  const parsed = JSON.parse(
    cleanJsonText(content),
  );

  return validateGeneratedContent(parsed);
}