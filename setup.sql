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

CREATE DATABASE IF NOT EXISTS db_course_project;

-- Step 2: Connect to the new database
-- In psql: \c db_course_project
-- In VS Code extension: switch your connection to 'db_course_project'
\c db_course_project

-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

-- Blogs table
CREATE TABLE IF NOT EXISTS blogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    author_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT FALSE,
    likes_count INT NOT NULL DEFAULT 0,
    comments_count INT NOT NULL DEFAULT 0,
    shares_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blog_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    parent_version_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_parent_version
        FOREIGN KEY (parent_version_id)
        REFERENCES blog_versions(id)
        ON DELETE SET NULL,

    CONSTRAINT unique_version_per_blog
        UNIQUE (blog_id, version_number)
);

ALTER TABLE blogs
ADD COLUMN current_version_id UUID;

ALTER TABLE blogs
ADD CONSTRAINT fk_current_version
FOREIGN KEY (current_version_id)
REFERENCES blog_versions(id)
ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS published_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES blog_versions(id) ON DELETE CASCADE,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT 'Setup complete! Tables created successfully.' AS status;