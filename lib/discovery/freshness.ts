import type { RawTopic } from "./rss";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function containsOldYear(text: string): boolean {
  const currentYear = new Date().getFullYear();

  const years = text.match(/\b(19|20)\d{2}\b/g);

  if (!years) {
    return false;
  }

  return years.some((year) => Number(year) < currentYear - 1);
}

export function filterFreshTopics<T extends RawTopic>(
  topics: T[],
): T[] {
  const now = Date.now();

  return topics.filter((topic) => {
    if (!topic.publishedAt) {
      return false;
    }

    if (containsOldYear(`${topic.title} ${topic.summary}`)) {
      return false;
    }

    const age = now - topic.publishedAt.getTime();

    return age >= 0 && age <= MAX_AGE_MS;
  });
}