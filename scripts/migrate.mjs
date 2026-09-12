import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "[SENSITIVE]") throw new Error("DATABASE_URL indisponível.");
const sql = neon(process.env.DATABASE_URL);
const migration = readFileSync(new URL("../migrations/001_unified_combo_platform.sql", import.meta.url), "utf8");
const statements = migration
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter((statement) => statement && !/^(BEGIN|COMMIT)$/i.test(statement));

await sql.transaction(statements.map((statement) => sql.query(statement)));
const [{ product_count: productCount }] = await sql`SELECT count(*)::int AS product_count FROM products WHERE merchant_slug = 'fer-reinher'`;
const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'combo_%' ORDER BY table_name`;
console.log(JSON.stringify({ applied: true, productCount, tables: tables.map((row) => row.table_name) }));
