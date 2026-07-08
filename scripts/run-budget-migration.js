const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

async function run() {
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not set");
        process.exit(1);
    }

    const sql = neon(process.env.DATABASE_URL);
    const filePath = path.join(__dirname, "04-create-budget-tables.sql");
    const raw = fs.readFileSync(filePath, "utf8");

    const statements = raw
        .split(/;\s*(?:\r?\n|$)/)
        .map((s) => s.replace(/--.*$/gm, "").trim())
        .filter((s) => s.length > 0);

    console.log(`Executing ${statements.length} statement(s) from 04-create-budget-tables.sql...`);

    for (const [i, stmt] of statements.entries()) {
        const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
        try {
            await sql.query(stmt);
            console.log(`  ✅ [${i + 1}/${statements.length}] ${preview}...`);
        } catch (err) {
            console.error(`  ❌ [${i + 1}/${statements.length}] ${preview}...`);
            console.error(`     ${err.message}`);
            process.exit(1);
        }
    }

    const tables = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('budgets','budget_materials','budget_labor','budget_extras','employees','app_settings')
        ORDER BY table_name
    `;
    console.log("\nTables now present:", tables.map((t) => t.table_name).join(", "));
    console.log("✅ Migration complete");
}

run().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
