import type { RawTopic } from "./rss";

const RELEVANT_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "llm",
  "large language model",
  "software",
  "developer",
  "programming",
  "code",
  "coding",
  "open source",
  "cloud",
  "database",
  "postgres",
  "security",
  "cybersecurity",
  "cyber",
  "reverse engineering",
  "agent",
  "agents",
  "automation",
  "api",
  "framework",
  "infrastructure",
  "computer",
  "technology",
  "tech",
  "cpu",
  "processor",
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
  "politics",
  "movie",
];

function cleanText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/article url:/gi, " ")
    .replace(/comments url:/gi, " ")
    .replace(/points:\s*\d+/gi, " ")
    .replace(/# comments:\s*\d+/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return new RegExp(
      `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
      "iu",
    ).test(text);
  });
}

export function filterRelevantTopics<T extends RawTopic>(
  topics: T[],
): T[] {
  return topics.filter((topic) => {
    const title = cleanText(topic.title);
    const summary = cleanText(topic.summary);

    const titleRelevant = containsKeyword(title, RELEVANT_KEYWORDS);
    const summaryRelevant = containsKeyword(summary, RELEVANT_KEYWORDS);

    const irrelevant =
      containsKeyword(title, IRRELEVANT_KEYWORDS) ||
      containsKeyword(summary, IRRELEVANT_KEYWORDS);

    if (irrelevant) {
      return false;
    }

    return titleRelevant || summaryRelevant;
  });
}