-- =============================================
-- DATABASE SETUP FOR DB COURSE PROJECT
-- =============================================
-- Run this file via the Node.js runner:
--   node run_setup.js
--
-- Or via psql (if installed and on PATH):
--   psql -U postgres -f setup.sql
-- =============================================

-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLE DEFINITIONS
-- =============================================

-- Users table (for authentication)
-- NOTE: id is UUID so that follows.follower_id / following_id can reference it
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(100) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password        VARCHAR(255) NOT NULL,
    otp_verified    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    profile_picture TEXT
);

-- Migration: add profile_picture to existing installs
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Blogs table
CREATE TABLE IF NOT EXISTS blogs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              TEXT NOT NULL,
    author_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ,
    is_deleted         BOOLEAN DEFAULT FALSE,
    is_published       BOOLEAN DEFAULT FALSE,
    likes_count        INT NOT NULL DEFAULT 0,
    comments_count     INT NOT NULL DEFAULT 0,
    shares_count       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blog_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id           UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    version_number    INT NOT NULL,
    title             TEXT,
    content           TEXT NOT NULL,
    parent_version_id UUID,
    created_at        TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_parent_version
        FOREIGN KEY (parent_version_id)
        REFERENCES blog_versions(id)
        ON DELETE SET NULL,

    CONSTRAINT unique_version_per_blog
        UNIQUE (blog_id, version_number)
);

ALTER TABLE blogs
    ADD COLUMN IF NOT EXISTS current_version_id UUID;

ALTER TABLE blogs
    DROP CONSTRAINT IF EXISTS fk_current_version;

ALTER TABLE blogs
    ADD CONSTRAINT fk_current_version
    FOREIGN KEY (current_version_id)
    REFERENCES blog_versions(id)
    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS published_versions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id      UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    version_id   UUID NOT NULL REFERENCES blog_versions(id) ON DELETE CASCADE,
    published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_likes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blog_id    UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_blog_like UNIQUE (user_id, blog_id)
);

CREATE TABLE IF NOT EXISTS blog_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id    UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_blog_id ON blog_comments(blog_id);

CREATE TABLE IF NOT EXISTS notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blog_id      UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    type         VARCHAR(20) NOT NULL CHECK (type IN ('like', 'comment')),
    is_read      BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications(recipient_id, is_read, created_at DESC);

-- Follows table (social graph)
CREATE TABLE IF NOT EXISTS follows (
    follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

CREATE TABLE IF NOT EXISTS saved_blogs (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blog_id    UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, blog_id)
);

-- =============================================
-- TRIGGERS & FUNCTIONS
-- =============================================

-- 1. Auto-update `updated_at` on blogs whenever the row changes
CREATE OR REPLACE FUNCTION update_blog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blog_updated_at ON blogs;
CREATE TRIGGER trg_blog_updated_at
    BEFORE UPDATE ON blogs
    FOR EACH ROW
    EXECUTE FUNCTION update_blog_updated_at();

-- 2. Auto-sync likes_count when blog_likes rows are inserted or deleted
CREATE OR REPLACE FUNCTION sync_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE blogs SET likes_count = likes_count + 1 WHERE id = NEW.blog_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE blogs SET likes_count = likes_count - 1 WHERE id = OLD.blog_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_likes_count ON blog_likes;
CREATE TRIGGER trg_sync_likes_count
    AFTER INSERT OR DELETE ON blog_likes
    FOR EACH ROW
    EXECUTE FUNCTION sync_likes_count();

-- 3. Auto-sync comments_count when blog_comments rows are inserted or deleted
CREATE OR REPLACE FUNCTION sync_comments_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE blogs SET comments_count = comments_count + 1 WHERE id = NEW.blog_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE blogs SET comments_count = comments_count - 1 WHERE id = OLD.blog_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_comments_count ON blog_comments;
CREATE TRIGGER trg_sync_comments_count
    AFTER INSERT OR DELETE ON blog_comments
    FOR EACH ROW
    EXECUTE FUNCTION sync_comments_count();

-- =============================================
-- ADDITIONAL INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_blogs_author    ON blogs(author_id);
CREATE INDEX IF NOT EXISTS idx_blogs_published ON blogs(is_published, is_deleted);
CREATE INDEX IF NOT EXISTS idx_blog_likes_blog ON blog_likes(blog_id);

SELECT 'Setup complete! Tables, triggers, and indexes created successfully.' AS status;