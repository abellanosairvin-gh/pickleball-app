import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Fallback keeps `next build` (which evaluates modules without env) from
// crashing; real requests need DATABASE_URL set.
const url =
  process.env.DATABASE_URL ?? "postgresql://missing:env@localhost/missing";

export const db = drizzle(neon(url), { schema });
