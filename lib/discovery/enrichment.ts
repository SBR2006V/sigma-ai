import type { MaterialDeltaTopic } from "./material-delta";
import { extractArticle } from "./article";

const MIN_SUMMARY_WORDS = 15;
const MAX_SUMMARY_WORDS = 1200;

function countWords(text: string): number {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function isUsableSummary(
  summary: string,
): boolean {
  return (
    countWords(summary) >= MIN_SUMMARY_WORDS
  );
}

function limitSummary(
  text: string,
): string {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= MAX_SUMMARY_WORDS) {
    return text.trim();
  }

  return (
    words
      .slice(0, MAX_SUMMARY_WORDS)
      .join(" ")
      .trim() + "..."
  );
}

function createSummary(
  text: string,
): string {
  return limitSummary(text);
}

export async function enrichTopicsWithArticles(
  topics: MaterialDeltaTopic[],
): Promise<MaterialDeltaTopic[]> {
  return Promise.all(
    topics.map(async (topic) => {
      /*
       * If RSS already contains enough substantive
       * evidence, keep it and avoid another request.
       */
      if (isUsableSummary(topic.summary)) {
        return topic;
      }

      /*
       * RSS evidence is weak. Fetch the actual article.
       */
      const article = await extractArticle(
        topic.url,
      );

      if (!article) {
        return topic;
      }

      const summary = createSummary(
        article.text,
      );

      /*
       * Never replace usable source content with
       * unusable extracted content.
       */
      if (!isUsableSummary(summary)) {
        return topic;
      }

      return {
        ...topic,
        summary,
      };
    }),
  );
}