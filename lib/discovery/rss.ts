import Parser from "rss-parser";

import type { NewsSource } from "./sources";

const parser = new Parser();

export interface RawTopic {
  title: string;
  summary: string;
  url: string;
  sourceName: NewsSource["name"];
  sourceType: NewsSource["type"];
  publishedAt: Date | null;
}

function cleanSummary(summary: string, sourceName: string): string {
  const cleaned = summary.trim();

  if (sourceName !== "Hacker News") {
    return cleaned;
  }

  const articleUrlIndex = cleaned.indexOf("Article URL:");
  const commentsUrlIndex = cleaned.indexOf("Comments URL:");

  if (articleUrlIndex === -1) {
    return cleaned;
  }

  const start = articleUrlIndex + "Article URL:".length;

  const end =
    commentsUrlIndex !== -1
      ? commentsUrlIndex
      : cleaned.length;

  const articleUrl = cleaned.slice(start, end).trim();

  if (!articleUrl) {
    return "";
  }

  return articleUrl;
}

export async function fetchRssSource(
  source: NewsSource
): Promise<RawTopic[]> {
  const feed = await parser.parseURL(source.url);

  return feed.items
    .map((item) => {
      const publishedAt = item.isoDate
        ? new Date(item.isoDate)
        : item.pubDate
          ? new Date(item.pubDate)
          : null;

      const rawSummary =
        item.contentSnippet?.trim() ??
        item.content?.trim() ??
        "";

      return {
        title: item.title?.trim() ?? "",
        summary: cleanSummary(rawSummary, source.name),
        url: item.link?.trim() ?? "",
        sourceName: source.name,
        sourceType: source.type,
        publishedAt,
      };
    })
    .filter((item) => item.title && item.url);
}