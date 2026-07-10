// Corre un archivo .sql contra la base (DATABASE_URL). Uso:
//   node scripts/run-sql.js scripts/10-alegra-mirror.sql
const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

async function run() {
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not set");
        process.exit(1);
    }
    const file = process.argv[2];
    if (!file || !fs.existsSync(file)) {
        console.error("Uso: node scripts/run-sql.js <archivo.sql>");
        process.exit(1);
    }
    const sql = neon(process.env.DATABASE_URL);
    const raw = fs.readFileSync(file, "utf8");
    const statements = raw
        .split(/;\s*(?:\r?\n|$)/)
        .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
        .filter((s) => s.length > 0);

    console.log(`Executing ${statements.length} statement(s) from ${file}...`);
    for (const [i, stmt] of statements.entries()) {
        const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
        try {
            await sql.query(stmt);
            console.log(`  ✅ [${i + 1}/${statements.length}] ${preview}...`);
        } catch (err) {
            console.error(`  ❌ [${i + 1}/${statements.length}] ${preview}...`);
            console.error("     " + err.message);
            process.exit(1);
        }
    }
    console.log("Done.");
}

run();
