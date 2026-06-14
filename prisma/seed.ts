import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  await db.product.upsert({
    where: { id: "seed-cookies" },
    update: {},
    create: {
      id: "seed-cookies",
      name: "Cookies",
      description: "Soft, chewy homemade cookies baked fresh to order. Classic chocolate chip and seasonal flavors available.",
      price: "12.00",
      batchSize: 12,
      unitLabel: "dozen",
      active: true,
    },
  });

  await db.product.upsert({
    where: { id: "seed-brownies" },
    update: {},
    create: {
      id: "seed-brownies",
      name: "Brownies",
      description: "Fudgy, rich chocolate brownies with a crinkly top and dense, gooey center.",
      price: "9.00",
      batchSize: 6,
      unitLabel: "half-dozen",
      active: true,
    },
  });

  await db.product.upsert({
    where: { id: "seed-cupcakes" },
    update: {},
    create: {
      id: "seed-cupcakes",
      name: "Cupcakes",
      description: "Fluffy, moist cupcakes with homemade buttercream frosting. Flavor options change seasonally.",
      price: "15.00",
      batchSize: 6,
      unitLabel: "half-dozen",
      active: true,
    },
  });

  console.log("Seed complete: Cookies, Brownies, Cupcakes");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
