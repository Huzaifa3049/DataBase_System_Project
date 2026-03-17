import { Pool } from 'pg';

// Database configuration - change these values for your project
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'db_course_project',   // Your project's own database
    password: '123',
    port: 5432,
    ssl: false,
});

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Database connected successfully at:', res.rows[0].now);
    }
});

export default pool;
