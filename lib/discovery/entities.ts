import { prisma } from "@/lib/db";
import type { RawTopic } from "./rss";

export interface ExtractedEntities {
  known: string[];
  patterns: string[];
  capitalized: string[];
}

export type EnrichedTopic = RawTopic & {
  entities: ExtractedEntities;
};

type KnownEntityRecord = {
  canonicalName: string;
  aliases: string[];
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * RSS/Hacker News summaries can contain Markdown links such as:
 *
 * [https://example.com/article](https://example.com/article)
 *
 * Entity extraction should never treat URL fragments as entities.
 */
function stripUrls(text: string): string {
  return text
    .replace(/\[[^\]]*\]\(https?:\/\/[^)]+\)/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ");
}

function cleanEntityText(text: string): string {
  return normalizeWhitespace(stripUrls(text));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesEntity(text: string, value: string): boolean {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return false;
  }

  const escaped = escapeRegExp(normalizedValue);

  /*
   * We deliberately use alphanumeric boundaries instead of \b.
   *
   * This handles entities such as:
   *   x86
   *   Next.js
   *   Node.js
   *   OpenJDK
   */
  const regex = new RegExp(
    `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`,
    "i",
  );

  return regex.test(text);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractPatternEntities(text: string): string[] {
  const cleanText = cleanEntityText(text);
  const results = new Set<string>();

  /*
   * CVE identifiers.
   *
   * Example:
   * CVE-2026-12345
   */
  for (const match of cleanText.matchAll(/\bCVE-\d{4}-\d+\b/gi)) {
    results.add(match[0].toUpperCase());
  }

  /*
   * Version strings.
   *
   * Examples:
   * v1.2
   * 1.2.3
   * v4.0.1
   *
   * The dots are escaped deliberately.
   */
  for (const match of cleanText.matchAll(
    /\bv?\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9.-]+)?\b/g,
  )) {
    results.add(match[0]);
  }

  /*
   * Repository references.
   *
   * Only inspect text after URLs have been removed, so Markdown links
   * cannot produce things such as:
   *
   *   github.com/foo/bar
   *
   * as fake entities.
   */
  for (const match of cleanText.matchAll(
    /\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/g,
  )) {
    const value = match[0];

    if (!value.includes("://")) {
      results.add(value);
    }
  }

  /*
   * Model / product version identifiers.
   *
   * Examples:
   * GPT-4
   * GPT-4.1
   * Llama-3
   * PostgreSQL-16
   *
   * Do not treat ordinary words followed by numbers as entities unless
   * the pattern looks like a real technical identifier.
   */
  for (const match of cleanText.matchAll(
    /\b(?:GPT|Llama|LLaMA|Claude|Gemini|Mistral|Qwen|DeepSeek|PostgreSQL|OpenJDK|Node\.js|Python|CUDA|Linux|Windows|Android|iOS)-?\d+(?:\.\d+)?\b/gi,
  )) {
    results.add(match[0]);
  }

  /*
   * Conservative acronym extraction.
   *
   * Short/common acronyms such as AI and US are intentionally excluded.
   * They are useful for relevance, but they are NOT useful dedup anchors.
   */
  const deniedAcronyms = new Set([
    "AI",
    "US",
    "UK",
    "EU",
    "THE",
    "AND",
    "FOR",
    "WITH",
    "FROM",
    "THIS",
    "THAT",
    "WHAT",
    "WHEN",
    "WHERE",
    "HOW",
    "WHY",
    "URL",
    "RSS",
    "HTTP",
    "HTTPS",
    "HTML",
    "JSON",
    "API",
  ]);

  for (const match of cleanText.matchAll(/\b[A-Z]{2,6}\b/g)) {
    const value = match[0];

    if (!deniedAcronyms.has(value)) {
      results.add(value);
    }
  }

  return unique([...results]);
}

function extractCapitalizedEntities(text: string): string[] {
  const cleanText = cleanEntityText(text);
  const results: string[] = [];

  /*
   * Conservative fallback only.
   *
   * We do NOT want entire headlines such as:
   *
   *   Managing AI Coding Costs
   *
   * to become entities.
   *
   * Instead, look for short proper-name-like sequences.
   */
  const pattern =
    /\b[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){1,2}\b/g;

  const rejectedStarts = new Set([
    "A",
    "An",
    "The",
    "Do",
    "Does",
    "Did",
    "How",
    "Why",
    "What",
    "When",
    "Where",
    "After",
    "Before",
    "Inside",
    "With",
    "From",
    "For",
    "And",
    "But",
    "New",
    "This",
    "That",
    "Managing",
    "Open",
    "Breaking",
    "Latest",
  ]);

  for (const match of cleanText.matchAll(pattern)) {
    const value = normalizeWhitespace(match[0]);
    const firstWord = value.split(/\s+/)[0];

    if (rejectedStarts.has(firstWord)) {
      continue;
    }

    /*
     * Ignore very generic phrases.
     */
    if (value.length < 4 || value.length > 60) {
      continue;
    }

    results.push(value);
  }

  return unique(results);
}

export async function loadKnownEntities(): Promise<KnownEntityRecord[]> {
  return prisma.knownEntity.findMany({
    select: {
      canonicalName: true,
      aliases: true,
    },
  });
}

export async function extractEntities(
  text: string,
  knownEntities?: KnownEntityRecord[],
): Promise<ExtractedEntities> {
  const cleanText = cleanEntityText(text);

  const known = knownEntities ?? (await loadKnownEntities());

  const knownMatches: string[] = [];

  /*
   * Prefer longer entity names first.
   *
   * Example:
   *   "GitHub Copilot"
   *
   * should be matched before a shorter alias such as:
   *   "Copilot"
   */
  const sortedEntities = [...known].sort(
    (a, b) =>
      Math.max(b.canonicalName.length, ...b.aliases.map((x) => x.length)) -
      Math.max(a.canonicalName.length, ...a.aliases.map((x) => x.length)),
  );

  for (const entity of sortedEntities) {
    const candidates = [entity.canonicalName, ...entity.aliases];

    if (
      candidates.some((candidate) => matchesEntity(cleanText, candidate))
    ) {
      knownMatches.push(entity.canonicalName);
    }
  }

  const patterns = extractPatternEntities(cleanText);

  /*
   * Capitalized extraction is intentionally only a fallback.
   *
   * If we already have strong entity signals, don't introduce weaker
   * guesses into the entity set.
   */
  const capitalized =
    knownMatches.length === 0 && patterns.length === 0
      ? extractCapitalizedEntities(cleanText)
      : [];

  return {
    known: unique(knownMatches),
    patterns: unique(patterns),
    capitalized: unique(capitalized),
  };
}

export async function enrichTopicsWithEntities(
  topics: RawTopic[],
): Promise<EnrichedTopic[]> {
  const knownEntities = await loadKnownEntities();

  return Promise.all(
    topics.map(async (topic) => {
      const text = `${topic.title}\n${topic.summary}`;

      const entities = await extractEntities(text, knownEntities);

      return {
        ...topic,
        entities,
      };
    }),
  );
}