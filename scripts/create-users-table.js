const { neon } = require("@neondatabase/serverless");
require('dotenv').config();

async function createUsersTable() {
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not set");
        return;
    }

    try {
        const sql = neon(process.env.DATABASE_URL);

        console.log("Creating users table...");

        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'operator',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `;

        console.log("✅ Users table created successfully");

        // Check if admin user exists, if not create one
        const adminEmail = "admin@example.com";
        const existingAdmin = await sql`SELECT * FROM users WHERE email = ${adminEmail}`;

        if (existingAdmin.length === 0) {
            // Password: admin123 (hashed for demo purposes - in production use bcrypt)
            // For simplicity in this demo step, we'll store plain text or simple hash, 
            // but for NextAuth we will implement proper hashing.
            // Let's just create the table first. We will handle seeding in a separate step or properly.
            console.log("ℹ️ No admin user found. You will need to create one.");
        } else {
            console.log("ℹ️ Admin user already exists.");
        }

    } catch (error) {
        console.error("❌ Error creating users table:", error);
    }
}

createUsersTable();
