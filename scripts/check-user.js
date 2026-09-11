const { connect } = require("./db");

async function checkUser() {

    try {
        const sql = connect();

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
