-- =============================================
-- DATABASE SETUP FOR DB COURSE PROJECT
-- =============================================
-- Run this file ONCE to create your project database and tables.
-- 
-- HOW TO RUN:
--   Option 1: Use a VS Code PostgreSQL extension (recommended)
--             Connect to localhost:5432 with user 'postgres', 
--             then run this file.
--
--   Option 2: From terminal:
--             psql -U postgres -f setup.sql
-- =============================================

-- Step 1: Create the project database (connect to 'postgres' default db first)
-- NOTE: You cannot run CREATE DATABASE inside a transaction block in some tools.
-- If this fails, run it separately or create the database manually first.

-- Uncomment the line below if running via psql:
-- CREATE DATABASE db_course_project;

-- Step 2: Connect to the new database
-- In psql: \c db_course_project
-- In VS Code extension: switch your connection to 'db_course_project'

-- =============================================
-- TABLE DEFINITIONS
-- =============================================

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    otp_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- =============================================
-- SAMPLE DATA (optional - uncomment cto insert)
-- =============================================
-- INSERT INTO Table1 (name, description) VALUES 
--     ('Item 1', 'First sample item'),
--     ('Item 2', 'Second sample item'),
--     ('Item 3', 'Third sample item');

SELECT 'Setup complete! Tables created successfully.' AS status;
