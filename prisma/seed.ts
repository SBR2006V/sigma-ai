import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

const entities = [
  {
    canonicalName: "OpenAI",
    aliases: ["Open AI"],
    category: "organization",
  },
  {
    canonicalName: "Astra",
    aliases: [],
    category: "AI model",
  },
  {
    canonicalName: "Google DeepMind",
    aliases: ["DeepMind"],
    category: "organization",
  },
  {
    canonicalName: "Hugging Face",
    aliases: ["HuggingFace"],
    category: "organization",
  },
  {
    canonicalName: "GitHub",
    aliases: [],
    category: "platform",
  },
  {
    canonicalName: "GitHub Copilot",
    aliases: ["Copilot"],
    category: "AI coding",
  },
  {
    canonicalName: "Groq",
    aliases: [],
    category: "AI infrastructure",
  },
  {
    canonicalName: "OpenJDK",
    aliases: ["Open JDK"],
    category: "software",
  },
  {
    canonicalName: "Cloudflare",
    aliases: [],
    category: "company",
  },
  {
    canonicalName: "Kitesurf",
    aliases: [],
    category: "AI browser",
  },
  {
    canonicalName: "Llama",
    aliases: ["LLaMA"],
    category: "AI model",
  },
  {
    canonicalName: "GPT",
    aliases: [],
    category: "AI model family",
  },
  {
    canonicalName: "Gemini",
    aliases: [],
    category: "AI model",
  },
  {
    canonicalName: "Claude",
    aliases: [],
    category: "AI model",
  },
  {
    canonicalName: "Anthropic",
    aliases: [],
    category: "organization",
  },
  {
    canonicalName: "TensorFlow",
    aliases: [],
    category: "machine learning",
  },
  {
    canonicalName: "PyTorch",
    aliases: [],
    category: "machine learning",
  },
  {
    canonicalName: "Supabase",
    aliases: [],
    category: "database",
  },
  {
    canonicalName: "Vercel",
    aliases: [],
    category: "deployment",
  },
  {
    canonicalName: "Next.js",
    aliases: ["NextJS", "Next JS"],
    category: "framework",
  },
  {
    canonicalName: "React",
    aliases: [],
    category: "framework",
  },
  {
    canonicalName: "Node.js",
    aliases: ["NodeJS", "Node JS"],
    category: "runtime",
  },
  {
    canonicalName: "TypeScript",
    aliases: ["TS"],
    category: "language",
  },
  {
    canonicalName: "JavaScript",
    aliases: ["JS"],
    category: "language",
  },
  {
    canonicalName: "Python",
    aliases: [],
    category: "language",
  },
  {
    canonicalName: "Rust",
    aliases: [],
    category: "language",
  },
  {
    canonicalName: "PostgreSQL",
    aliases: ["Postgres"],
    category: "database",
  },
  {
    canonicalName: "Redis",
    aliases: [],
    category: "database",
  },
  {
    canonicalName: "Docker",
    aliases: [],
    category: "developer tools",
  },
  {
    canonicalName: "Kubernetes",
    aliases: ["K8s"],
    category: "infrastructure",
  },
  {
    canonicalName: "AWS",
    aliases: ["Amazon Web Services"],
    category: "cloud",
  },
  {
    canonicalName: "Azure",
    aliases: ["Microsoft Azure"],
    category: "cloud",
  },
  {
    canonicalName: "Google Cloud",
    aliases: ["GCP"],
    category: "cloud",
  },
  {
    canonicalName: "Linux",
    aliases: [],
    category: "operating system",
  },
  {
    canonicalName: "Windows",
    aliases: [],
    category: "operating system",
  },
  {
    canonicalName: "x86",
    aliases: ["x86-64", "x86_64"],
    category: "architecture",
  },
  {
    canonicalName: "ARM",
    aliases: ["ARM64", "AArch64"],
    category: "architecture",
  },
  {
    canonicalName: "CUDA",
    aliases: [],
    category: "GPU computing",
  },
  {
    canonicalName: "NVIDIA",
    aliases: [],
    category: "hardware",
  },
  {
    canonicalName: "AMD",
    aliases: [],
    category: "hardware",
  },
  {
    canonicalName: "Intel",
    aliases: [],
    category: "hardware",
  },
  {
    canonicalName: "OWASP",
    aliases: [],
    category: "security",
  },
  {
    canonicalName: "Log4j",
    aliases: ["Log4Shell"],
    category: "security",
  },
  {
    canonicalName: "MCP",
    aliases: ["Model Context Protocol"],
    category: "AI infrastructure",
  },
  {
    canonicalName: "RAG",
    aliases: ["Retrieval Augmented Generation"],
    category: "AI",
  },
  {
    canonicalName: "SIMD",
    aliases: [],
    category: "systems",
  },
  {
    canonicalName: "Open Source",
    aliases: ["Open-Source"],
    category: "software",
  },
  {
    canonicalName: "TechCrunch",
    aliases: [],
    category: "media",
  },
  {
    canonicalName: "Hacker News",
    aliases: ["HN"],
    category: "community",
  },
];

async function main() {
  for (const entity of entities) {
    await prisma.knownEntity.upsert({
      where: {
        canonicalName: entity.canonicalName,
      },
      update: {
        aliases: entity.aliases,
        category: entity.category,
      },
      create: entity,
    });
  }

  console.log(`Seeded ${entities.length} known entities.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });