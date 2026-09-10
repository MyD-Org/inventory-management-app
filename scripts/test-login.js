const { connect } = require("./db");
const bcrypt = require("bcryptjs");

async function testLogin() {

    try {
        const sql = connect();

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
