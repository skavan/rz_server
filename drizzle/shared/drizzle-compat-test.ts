import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL not found in .env file.");
  process.exit(1);
}

const client = new Client({ connectionString });

async function testDrizzleOrm() {
  try {
    await client.connect();
    const db = drizzle(client);
    console.log("drizzle-orm initialized and connected successfully.");
    await client.end();
    console.log("drizzle-orm test completed. Now test drizzle-kit via CLI.");
  } catch (error) {
    console.error("Compatibility test failed:", error);
    await client.end();
  }
}

testDrizzleOrm();
