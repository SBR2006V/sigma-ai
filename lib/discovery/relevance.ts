import type { MaterialDeltaTopic } from "./material-delta";

const STRONG_RELEVANT_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "llm",
  "large language model",
  "generative ai",
  "foundation model",
  "language model",
  "ai agent",
  "ai agents",
  "agentic",
  "automation",
  "openai",
  "anthropic",
  "google deepmind",
  "hugging face",
  "github",
  "cloudflare",
  "model",
  "neural network",
  "computer vision",
  "natural language processing",
  "nlp",
];

const TECH_RELEVANT_KEYWORDS = [
  "software",
  "developer",
  "developers",
  "programming",
  "code",
  "coding",
  "open source",
  "api",
  "framework",
  "infrastructure",
  "cloud",
  "database",
  "postgres",
  "cybersecurity",
  "cyber security",
  "cyber",
  "reverse engineering",
  "cpu",
  "processor",
  "developer tools",
];

const IRRELEVANT_KEYWORDS = [
  "sports",
  "football",
  "soccer",
  "cricket",
  "celebrity",
  "fashion",
  "recipe",
  "cooking",
  "movie",
  "movies",
  "politics",
  "election",
  "government",
  "travel",
  "real estate",
];

function cleanText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/article url:/gi, " ")
    .replace(/comments url:/gi, " ")
    .replace(/points:\s*\d+/gi, " ")
    .replace(/#\s*comments:\s*\d+/gi, " ")
    .replace(/\bcomments:\s*\d+/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsKeyword(
  text: string,
  keywords: string[],
): boolean {
  return keywords.some((keyword) => {
    const escaped = keyword.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    return new RegExp(
      `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
      "iu",
    ).test(text);
  });
}

function isSubstantiveSummary(
  summary: string,
): boolean {
  const cleaned = cleanText(summary);

  if (!cleaned) {
    return false;
  }

  const words = cleaned
    .split(/\s+/)
    .filter(Boolean);

  return words.length >= 8;
}

function isRelevant(
  topic: MaterialDeltaTopic,
): boolean {
  const title = cleanText(topic.title);
  const summary = cleanText(topic.summary);

  if (!title) {
    return false;
  }

  const combined = `${title} ${summary}`;

  if (
    containsKeyword(
      combined,
      IRRELEVANT_KEYWORDS,
    )
  ) {
    return false;
  }

  const strongInTitle = containsKeyword(
    title,
    STRONG_RELEVANT_KEYWORDS,
  );

  const strongInSummary = containsKeyword(
    summary,
    STRONG_RELEVANT_KEYWORDS,
  );

  const technicalInTitle = containsKeyword(
    title,
    TECH_RELEVANT_KEYWORDS,
  );

  const technicalInSummary = containsKeyword(
    summary,
    TECH_RELEVANT_KEYWORDS,
  );

  /*
   * Strong AI/technology signal in the title.
   *
   * This intentionally does not require a substantive
   * RSS summary. Weak RSS summaries are handled later
   * by article extraction and evidence validation.
   */
  if (strongInTitle) {
    return true;
  }

  /*
   * Strong signal in the summary with enough
   * substantive content.
   */
  if (
    strongInSummary &&
    isSubstantiveSummary(summary)
  ) {
    return true;
  }

  /*
   * Technical topics require relevant signals
   * in both title and summary.
   */
  if (
    technicalInTitle &&
    technicalInSummary &&
    isSubstantiveSummary(summary)
  ) {
    return true;
  }

  return false;
}

export function filterRelevantTopics(
  topics: MaterialDeltaTopic[],
): MaterialDeltaTopic[] {
  return topics.filter(isRelevant);
}