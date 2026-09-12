import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "[SENSITIVE]") throw new Error("DATABASE_URL indisponível.");
const sql = neon(process.env.DATABASE_URL);
const columns = await sql`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`;
console.log(JSON.stringify(columns, null, 2));
