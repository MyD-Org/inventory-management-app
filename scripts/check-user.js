const { neon } = require("@neondatabase/serverless");
require('dotenv').config();

async function checkUser() {
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not set");
        return;
    }

    try {
        const sql = neon(process.env.DATABASE_URL);

        const email = "admin@example.com";
        const user = await sql`SELECT * FROM users WHERE email = ${email}`;

        if (user.length > 0) {
            console.log("✅ User found:");
            console.log("ID:", user[0].id);
            console.log("Email:", user[0].email);
            console.log("Role:", user[0].role);
            console.log("Password Hash (first 10 chars):", user[0].password.substring(0, 10) + "...");
        } else {
            console.log("❌ User NOT found");
        }

    } catch (error) {
        console.error("❌ Error checking user:", error);
    }
}

checkUser();
