const { connect } = require("./db");

async function checkDb() {

    try {
        const sql = connect();

        console.log("Checking database connection...");

        // Check tables
        const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
        console.log("Tables found:", tables.map(t => t.table_name));

        // Check counts
        const materialsCount = await sql`SELECT count(*) FROM materials`;
        console.log("Materials count:", materialsCount[0].count);

        const inventoryCount = await sql`SELECT count(*) FROM inventory`;
        console.log("Inventory count:", inventoryCount[0].count);

        const movementsCount = await sql`SELECT count(*) FROM stock_movements`;
        console.log("Stock Movements count:", movementsCount[0].count);

    } catch (error) {
        console.error("❌ Error connecting to database:", error);
    }
}

checkDb();
