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

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function removeMarkdownLinks(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHackerNewsSummary(summary: string): string {
  let cleaned = stripHtml(summary);

  /*
   * HN RSS frequently produces metadata such as:
   *
   * Article URL: https://...
   * Comments URL: https://...
   * Points: 123
   * # Comments: 45
   *
   * These are not article evidence.
   */

  cleaned = cleaned
    .replace(/Article URL:\s*/gi, " ")
    .replace(/Comments URL:\s*/gi, " ")
    .replace(/Points:\s*\d+/gi, " ")
    .replace(/#\s*Comments:\s*\d+/gi, " ")
    .replace(/\bComments:\s*\d+/gi, " ")
    .replace(/\bPoints:\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  /*
   * If what remains is essentially only URLs,
   * treat it as having no usable evidence.
   */
  const withoutUrls = cleaned
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutUrls) {
    return "";
  }

  return removeMarkdownLinks(cleaned);
}

function cleanSummary(summary: string, sourceName: string): string {
  const cleaned = stripHtml(summary);

  if (sourceName === "Hacker News") {
    return cleanHackerNewsSummary(cleaned);
  }

  return removeMarkdownLinks(cleaned);
}

function getItemSummary(item: Parser.Item): string {
  /*
   * Prefer contentSnippet because it is generally cleaner
   * for RSS feeds intended for text processing.
   */
  if (item.contentSnippet?.trim()) {
    return item.contentSnippet.trim();
  }

  if (item.content?.trim()) {
    return item.content.trim();
  }

  if (item.summary?.trim()) {
    return item.summary.trim();
  }

  return "";
}

export async function fetchRssSource(
  source: NewsSource,
): Promise<RawTopic[]> {
  const feed = await parser.parseURL(source.url);

  return feed.items
    .map((item) => {
      const publishedAt = item.isoDate
        ? new Date(item.isoDate)
        : item.pubDate
          ? new Date(item.pubDate)
          : null;

      const title = item.title?.trim() ?? "";
      const url = item.link?.trim() ?? "";

      const rawSummary = getItemSummary(item);

      const summary = cleanSummary(
        rawSummary,
        source.name,
      );

      return {
        title,
        summary,
        url,
        sourceName: source.name,
        sourceType: source.type,
        publishedAt,
      };
    })
    .filter(
      (item) =>
        item.title.length > 0 &&
        item.url.length > 0,
    );
}