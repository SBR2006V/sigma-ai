import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  console.log(
    "DATABASE_URL:",
    process.env.DATABASE_URL ? "loaded" : "missing",
  );

  const result = await prisma.$queryRaw<
    { now: Date }[]
  >`SELECT NOW() AS now`;

  console.log("Database connection successful:");
  console.log(result);
}

main()
  .catch((error) => {
    console.error("Database connection failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });