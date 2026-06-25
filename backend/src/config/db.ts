import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("CRITICAL: DATABASE_URL environment variable is missing.");
}

// Production-ready connection configurations
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Limit pool clients to prevent connection starvation
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("Unexpected idle PostgreSQL client breakdown:", err);
});
