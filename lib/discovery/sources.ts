export type SourceType = "PRIMARY" | "SECONDARY";

export interface NewsSource {
  name: string;
  url: string;
  type: SourceType;
  categories: string[];
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    name: "OpenAI",
    url: "https://openai.com/news/rss.xml",
    type: "PRIMARY",
    categories: ["AI", "Machine Learning", "Software"],
  },
  {
    name: "Google DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
    type: "PRIMARY",
    categories: ["AI", "Machine Learning", "Research"],
  },
  {
    name: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml",
    type: "PRIMARY",
    categories: ["AI", "Machine Learning", "Open Source"],
  },
  {
    name: "GitHub Blog",
    url: "https://github.blog/feed/",
    type: "PRIMARY",
    categories: ["Software", "Open Source", "Developer Tools"],
  },
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    type: "SECONDARY",
    categories: ["Technology", "Software", "AI"],
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    type: "SECONDARY",
    categories: ["AI", "Technology", "Startups"],
  },
];