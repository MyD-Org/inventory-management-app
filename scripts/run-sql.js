// Corre un archivo .sql contra la base (DATABASE_URL). Uso:
//   node scripts/run-sql.js scripts/10-alegra-mirror.sql
//
// CONTRA QUÉ BASE: la que diga DATABASE_URL, y por el proxy local si hay
// NEON_LOCAL_PROXY (ver scripts/db.js). Lo imprime antes de tocar nada.
const fs = require("fs");
const { connect } = require("./db");

async function run() {
    const file = process.argv[2];
    if (!file || !fs.existsSync(file)) {
        console.error("Uso: node scripts/run-sql.js <archivo.sql>");
        process.exit(1);
    }
    const sql = connect();
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
