/**
 * Run analytics DDL against Neon. Uses NEON_DATABASE_URL or DATABASE_URL.
 *
 * Usage (do not commit credentials):
 *   NEON_DATABASE_URL='postgresql://...' bun run scripts/run-neon-ddl.ts
 * or
 *   DATABASE_URL='postgresql://...' bun run scripts/run-neon-ddl.ts
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url =
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!url) {
  console.error(
    "Set NEON_DATABASE_URL or DATABASE_URL (e.g. export DATABASE_URL='postgresql://...')"
  );
  process.exit(1);
}

const sql = neon(url);
const ddlPath = join(__dirname, "neon-ddl.sql");
const ddl = readFileSync(ddlPath, "utf-8");

// Split into statements: by semicolon, strip line comments, skip empty
const statements = ddl
  .split(";")
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter((s) => s.length > 0);

async function main() {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ";";
    try {
      await sql.query(stmt, []);
      const preview = stmt.slice(0, 55).replace(/\s+/g, " ");
      console.log(`OK ${i + 1}/${statements.length}: ${preview}...`);
    } catch (e) {
      console.error(`Failed statement ${i + 1}:`, stmt.slice(0, 120));
      throw e;
    }
  }
  console.log("Neon analytics DDL applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
