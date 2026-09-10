const { connect } = require("./db");
const bcrypt = require("bcryptjs");

async function seedAdmin() {

    try {
        const sql = connect();

        const email = "admin@example.com";
        const password = "admin"; // Simple password for initial access
        const hashedPassword = await bcrypt.hash(password, 10);
        const name = "Administrador";
        const role = "admin";

        console.log(`Seeding admin user (${email})...`);

        // Check if exists
        const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
        if (existing.length > 0) {
            console.log("ℹ️ Admin user already exists. Updating password...");
            await sql`
                UPDATE users 
                SET password = ${hashedPassword}, role = ${role}, name = ${name}
                WHERE email = ${email}
            `;
        } else {
            await sql`
                INSERT INTO users (name, email, password, role)
                VALUES (${name}, ${email}, ${hashedPassword}, ${role})
            `;
        }

        console.log("✅ Admin user seeded successfully.");
        console.log("📧 Email: admin@example.com");
        console.log("🔑 Password: admin");

    } catch (error) {
        console.error("❌ Error seeding admin:", error);
    }
}

seedAdmin();
