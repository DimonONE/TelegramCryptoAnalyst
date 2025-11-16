import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";

// Validate DATABASE_URL is present
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. Please configure your database connection.');
}

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Create Neon Pool client
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create Drizzle instance with Neon Pool client
export const db = drizzle(pool, { schema });
