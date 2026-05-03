import pool from './db.js';

async function migrate() {
    try {
       
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_blog_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);
        await pool.query(`DROP TRIGGER IF EXISTS trg_blog_updated_at ON blogs`);
        await pool.query(`
            CREATE TRIGGER trg_blog_updated_at
                BEFORE UPDATE ON blogs
                FOR EACH ROW
                EXECUTE FUNCTION update_blog_updated_at()
        `);
        console.log('✅ updated_at trigger created');

       
        await pool.query(`
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
            $$ LANGUAGE plpgsql
        `);
        await pool.query(`DROP TRIGGER IF EXISTS trg_sync_likes_count ON blog_likes`);
        await pool.query(`
            CREATE TRIGGER trg_sync_likes_count
                AFTER INSERT OR DELETE ON blog_likes
                FOR EACH ROW
                EXECUTE FUNCTION sync_likes_count()
        `);
        console.log('✅ likes_count trigger created');

       
        await pool.query(`
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
            $$ LANGUAGE plpgsql
        `);
        await pool.query(`DROP TRIGGER IF EXISTS trg_sync_comments_count ON blog_comments`);
        await pool.query(`
            CREATE TRIGGER trg_sync_comments_count
                AFTER INSERT OR DELETE ON blog_comments
                FOR EACH ROW
                EXECUTE FUNCTION sync_comments_count()
        `);
        console.log('✅ comments_count trigger created');

       
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_blogs_author ON blogs(author_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_blogs_published ON blogs(is_published, is_deleted)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_blog_likes_blog ON blog_likes(blog_id)`);
        console.log('✅ Indexes created');

        console.log('\n✅ All migrations complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
