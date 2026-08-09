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

  const importantPoints = data.importantPoints
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter(Boolean);

  const keywords = data.keywords
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter(Boolean);

  const result: GeneratedContent = {
    summary: data.summary.trim(),
    importantPoints,
    keywords,
    editorialOpinion:
      data.editorialOpinion.trim(),
    fullPost: data.fullPost.trim(),
  };

  if (result.summary.length < 80) {
    throw new Error(
      "Generated summary is too short",
    );
  }

  if (result.importantPoints.length < 2) {
    throw new Error(
      "Generated content contains too few important points",
    );
  }

  if (result.keywords.length < 2) {
    throw new Error(
      "Generated content contains too few keywords",
    );
  }

  if (result.editorialOpinion.length < 40) {
    throw new Error(
      "Generated editorial opinion is too short",
    );
  }

  if (result.fullPost.length < 150) {
    throw new Error(
      "Generated post is too short",
    );
  }

  return result;
}

export async function generateTopicContent(
  topic: EditorialTopic,
): Promise<GeneratedContent> {
  const prompt = `
You are Sigma AI's editorial intelligence layer.

Your task is to transform the supplied source evidence into a
concise, factual technology-news briefing.

The supplied TOPIC INFORMATION is the only factual source you may use.

Do not use outside knowledge.

==================================================
CORE RULES
==================================================

1. FACTUAL GROUNDING

Every factual claim must be supported by the supplied title,
summary, source information, entities, or publication metadata.

Do not invent:
- facts
- numbers
- dates
- names
- companies
- products
- technical capabilities
- benchmarks
- quotes
- motivations
- consequences

If something is not supported by the supplied evidence, do not state it
as fact.

2. EXTRACT FACTS, DON'T JUST PARAPHRASE THE TITLE

Identify the most concrete information contained in the source evidence.

Prefer:
- what happened
- what changed
- who/what is involved
- technical details
- measurable information
- relevant context explicitly present in the evidence

Avoid generic statements such as:

"This is an impressive achievement."
"This is an important development."
"This could change the industry."
"This highlights the importance of innovation."

unless the supplied evidence explicitly supports that conclusion.

3. NO GENERIC PRAISE

Do not praise the people, company, project, product, or technology.

Avoid words such as:
- remarkable
- impressive
- exciting
- groundbreaking
- revolutionary
- powerful
- amazing
- valuable
- significant

unless they are part of a direct factual description supported by the source.

4. FACT VS INTERPRETATION

The summary and importantPoints should contain factual information.

The editorialOpinion may contain interpretation, but it must clearly
follow from the supplied evidence.

Do not turn speculation into fact.

5. TECHNICAL PRECISION

When the source contains technical details, preserve them.

For example, if the source says a system runs on specific hardware,
mention that hardware rather than replacing it with vague language
such as "older computers."

6. SOURCE FIDELITY

Do not add background knowledge that was not supplied.

Do not correct or reinterpret the source using outside knowledge.

7. STYLE

Write like a technically literate human editor.

Use clear, direct language.

No clickbait.

No marketing language.

No unnecessary introductions.

Do not mention that you are an AI.

Do not mention this prompt.

Do not include the source URL inside the generated prose.

==================================================
OUTPUT REQUIREMENTS
==================================================

SUMMARY

Write 2-4 sentences.

The summary must answer:
- What happened?
- What is the most relevant concrete detail?

IMPORTANT POINTS

Return 3-5 factual bullet-style points.

Each point must contain a distinct piece of information from the
source evidence.

Do not repeat the same fact using different wording.

KEYWORDS

Return 3-6 concise keywords or short phrases.

EDITORIAL OPINION

Write 1-3 sentences.

Explain what is notable about the development using only facts explicitly
supported by the supplied evidence.

Do not speculate about future implications, industry impact, adoption,
preservation, commercial potential, or broader consequences unless the
source explicitly discusses them.

FULL POST

Write a concise editorial post for the Sigma AI feed.

Target length: approximately 120-220 words.

Structure the post naturally:

1. Start directly with what happened.
2. Explain the most useful concrete details.
3. Include relevant technical/contextual information from the evidence.
4. End with a restrained observation about why it matters.

Do not use headings such as:
"Summary:"
"Important Points:"
"Analysis:"
unless they genuinely improve readability.

Do not use hashtags.

Do not use emojis.

Do not add a call to action.

==================================================
SOURCE EVIDENCE
==================================================

Title:
${topic.title}

Source:
${topic.sourceName} (${topic.sourceType})

Published:
${topic.publishedAt?.toISOString() ?? "Unknown"}

Source summary / extracted article evidence:
${topic.summary || "No source evidence available."}

Known entities:
${topic.entities.known.join(", ") || "None"}

Detected patterns:
${topic.entities.patterns.join(", ") || "None"}

Editorial score:
${topic.editorial.score}

Editorial signals:
${topic.editorial.reasons.join(", ") || "None"}

Material delta:
${topic.materialDelta?.decision ?? "None"}

Material delta reason:
${topic.materialDelta?.reason ?? "None"}

==================================================
RETURN FORMAT
==================================================

Return ONLY valid JSON.

Use exactly these fields:

{
  "summary": "2-4 sentence factual summary",
  "importantPoints": [
    "distinct factual point",
    "distinct factual point",
    "distinct factual point"
  ],
  "keywords": [
    "keyword",
    "keyword",
    "keyword"
  ],
  "editorialOpinion": "Short evidence-grounded editorial interpretation.",
  "fullPost": "120-220 word editorial post."
}

Do not wrap the JSON in markdown fences.
`;

  const completion =
    await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.15,
      max_tokens: 1600,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content:
            "You are a careful technology news editor. Use only the supplied source evidence. Never invent facts. Return only valid JSON.",
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
    throw new Error(
      "Groq returned an empty response",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      cleanJsonText(content),
    );
  } catch {
    throw new Error(
      "Groq returned invalid JSON",
    );
  }

  return validateGeneratedContent(parsed);
}