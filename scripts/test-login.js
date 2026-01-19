const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
require('dotenv').config();

async function testLogin() {
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not set");
        return;
    }

    try {
        const sql = neon(process.env.DATABASE_URL);

        const email = "admin@example.com";
        const passwordAttempt = "admin";

        console.log(`Testing login for ${email} with password '${passwordAttempt}'...`);

        const user = await sql`SELECT * FROM users WHERE email = ${email}`;

        if (user.length === 0) {
            console.log("❌ User not found");
            return;
        }

        const dbUser = user[0];
        console.log("User found in DB.");
        console.log("Stored Hash:", dbUser.password);

        const match = await bcrypt.compare(passwordAttempt, dbUser.password);

        if (match) {
            console.log("✅ Password MATCHES!");
        } else {
            console.log("❌ Password DOES NOT MATCH.");
        }

    } catch (error) {
        console.error("❌ Error testing login:", error);
    }
}

testLogin();
