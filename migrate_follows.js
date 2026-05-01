/**
 * migrate_follows.js
 * ------------------
 * Adds the `follows` table (and its index) to db_course_project.
 * Safe to re-run — uses IF NOT EXISTS.
 *
 * Usage:  node migrate_follows.js
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  password: '123',
  port: 5432,
  database: 'db_course_project',
});

await client.connect();
console.log('✅ Connected to db_course_project');

try {
  // users.id is INTEGER (SERIAL), so follower_id / following_id must be INT
  await client.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id != following_id)
    );
  `);
  console.log('✅ follows table created (or already existed)');

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_follows_following
    ON follows (following_id);
  `);
  console.log('✅ idx_follows_following index created (or already existed)');

  // Verify
  const res = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'follows'
    ORDER BY ordinal_position;
  `);
  console.log('\nfollows table columns:');
  res.rows.forEach(r => console.log(`  ${r.column_name.padEnd(16)} ${r.data_type}`));

  console.log('\n🎉 Migration complete!');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
