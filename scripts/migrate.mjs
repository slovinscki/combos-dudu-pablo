import { readFileSync, readdirSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "[SENSITIVE]") throw new Error("DATABASE_URL indisponível.");
const sql = neon(process.env.DATABASE_URL);
const migrationsUrl = new URL("../migrations/", import.meta.url);
const files = readdirSync(migrationsUrl).filter((file) => file.endsWith(".sql")).sort();
for (const file of files) {
  const migration = readFileSync(new URL(file, migrationsUrl), "utf8");
  const statements = migration
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^(BEGIN|COMMIT)$/i.test(statement));
  await sql.transaction(statements.map((statement) => sql.query(statement)));
}
const productCounts = await sql`SELECT merchant_slug, count(*)::int AS product_count FROM products WHERE merchant_slug IN ('fer-reinher', 'pizzaria-varandas') GROUP BY merchant_slug ORDER BY merchant_slug`;
const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'combo_%' ORDER BY table_name`;
console.log(JSON.stringify({ applied: true, migrations: files, productCounts, tables: tables.map((row) => row.table_name) }));
