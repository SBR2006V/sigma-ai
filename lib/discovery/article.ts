import axios from "axios";
import * as cheerio from "cheerio";

export type ArticleExtractionResult = {
  text: string;
  title?: string;
};

const MAX_TEXT_LENGTH = 8000;
const MAX_PARAGRAPHS = 35;
const REQUEST_TIMEOUT_MS = 8000;

const BLOCKED_HOSTS = new Set([
  "news.ycombinator.com",
]);

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "iframe",
  "button",
  "input",
  "textarea",
  "select",
  ".newsletter",
  ".newsletter-signup",
  ".subscribe",
  ".subscription",
  ".advertisement",
  ".advert",
  ".ads",
  ".ad",
  ".related",
  ".related-posts",
  ".recommended",
  ".recommendations",
  ".social-share",
  ".share-buttons",
  ".comments",
  ".comment-section",
  ".cookie",
  ".popup",
  ".modal",
  ".paywall",
  ".promo",
];

const NOISE_PATTERNS = [
  // Common short boilerplate
  /^subscribe\b/i,
  /^sign up\b/i,
  /^newsletter\b/i,
  /^read more\b/i,
  /^related\b/i,
  /^recommended\b/i,
  /^follow us\b/i,
  /^advertisement\b/i,
  /^advertising\b/i,
  /^comments?\b/i,
  /^share\b/i,
  /^get the latest\b/i,
  /^stay up to date\b/i,
  /^register now\b/i,
  /^save up to\b/i,

  // Promotional content
  /\bregister now\b/i,
  /\bsave up to \$?\d+/i,
  /\bjoin us\b.*\bevent\b/i,
  /\bgrow your portfolio\b/i,
  /\bgain practical expertise\b/i,
  /\bno matter your goal\b/i,
  /\bscale faster\b/i,
];

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanParagraph(text: string): string {
  return normalizeText(text)
    .replace(/^\s*[-•]\s*/, "")
    .trim();
}

function isNoiseParagraph(text: string): boolean {
  const normalized = cleanParagraph(text);

  if (!normalized) {
    return true;
  }

  if (normalized.length < 40) {
    return true;
  }

  return NOISE_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

function removeInlineNoise(text: string): string {
  return text
    .replace(
      /\bScale faster\..*?(?=Newsletters|Related|Latest in AI|$)/gi,
      "",
    )
    .replace(
      /\bSave up to \$?\d+ today!.*?(?=Newsletters|Related|Latest in AI|$)/gi,
      "",
    )
    .replace(
      /\bREGISTER NOW\b.*?(?=Newsletters|Related|Latest in AI|$)/gi,
      "",
    )
    .replace(
      /\bNewsletters\b.*?(?=Related|Latest in AI|$)/gi,
      "",
    )
    .replace(
      /\bRelated Media & Entertainment\b.*?(?=Latest in AI|$)/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function isValidArticleText(text: string): boolean {
  const normalized = normalizeText(text);

  if (normalized.length < 300) {
    return false;
  }

  const words = normalized
    .split(/\s+/)
    .filter(Boolean);

  return words.length >= 60;
}

function getArticleUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return null;
    }

    if (BLOCKED_HOSTS.has(parsed.hostname)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function deduplicateParagraphs(
  paragraphs: string[],
): string[] {
  const seen = new Set<string>();

  return paragraphs.filter((paragraph) => {
    const key = paragraph
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractParagraphs(
  $: cheerio.CheerioAPI,
  selector: string,
): string[] {
  const paragraphs = $(selector)
    .find("p")
    .map((_, element) =>
      cleanParagraph($(element).text()),
    )
    .get()
    .filter((paragraph) => !isNoiseParagraph(paragraph));

  return deduplicateParagraphs(paragraphs);
}

function extractArticleText(html: string): {
  text: string;
  title?: string;
} {
  const $ = cheerio.load(html);

  for (const selector of NOISE_SELECTORS) {
    $(selector).remove();
  }

  const title =
    normalizeText(
      $("article h1").first().text() ||
        $("main h1").first().text() ||
        $("h1").first().text() ||
        $('meta[property="og:title"]')
          .attr("content") ||
        $("title").first().text(),
    ) || undefined;

  const candidates = [
    "article",
    '[role="main"]',
    "main",
    ".article-content",
    ".article-body",
    ".post-content",
    ".entry-content",
    ".post-body",
  ];

  let bestParagraphs: string[] = [];

  for (const selector of candidates) {
    const element = $(selector).first();

    if (!element.length) {
      continue;
    }

    const paragraphs = extractParagraphs(
      $,
      selector,
    );

    if (
      paragraphs.join(" ").length >
      bestParagraphs.join(" ").length
    ) {
      bestParagraphs = paragraphs;
    }

    if (
      isValidArticleText(
        paragraphs.join(" "),
      )
    ) {
      break;
    }
  }

  /*
   * Some sites don't expose a useful article
   * container. Fall back to all meaningful
   * elements on the page.
   */
  if (
    !isValidArticleText(
      bestParagraphs.join(" "),
    )
  ) {
    const paragraphs = $("p")
      .map((_, element) =>
        cleanParagraph($(element).text()),
      )
      .get()
      .filter(
        (paragraph) =>
          !isNoiseParagraph(paragraph),
      );

    bestParagraphs =
      deduplicateParagraphs(paragraphs);
  }

  /*
   * Limit the amount of evidence passed further
   * down the pipeline. We want article substance,
   * not the entire webpage.
   */
  const selectedParagraphs =
    bestParagraphs.slice(0, MAX_PARAGRAPHS);

  const text = removeInlineNoise(
    normalizeText(
      selectedParagraphs.join("\n\n"),
    ),
  ).slice(0, MAX_TEXT_LENGTH);

  return {
    title,
    text,
  };
}

export async function extractArticle(
  url: string,
): Promise<ArticleExtractionResult | null> {
  const articleUrl = getArticleUrl(url);

  if (!articleUrl) {
    return null;
  }

  try {
    const response = await axios.get(
      articleUrl,
      {
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        responseType: "text",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SigmaAI/1.0)",
          Accept:
            "text/html,application/xhtml+xml",
        },
        validateStatus: (status) =>
          status >= 200 && status < 400,
      },
    );

    const contentType = String(
      response.headers["content-type"] ?? "",
    ).toLowerCase();

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return null;
    }

    const result = extractArticleText(
      response.data,
    );

    if (!isValidArticleText(result.text)) {
      return null;
    }

    return result;
  } catch (error) {
    console.warn(
      `Article extraction failed for ${articleUrl}:`,
      error instanceof Error
        ? error.message
        : error,
    );

    return null;
  }
}