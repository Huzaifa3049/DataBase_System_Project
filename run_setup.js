
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const DB_CONFIG = {
  user: 'postgres',
  host: 'localhost',
  password: '123',
  port: 5432,
};

async function createDatabaseIfNeeded() {
 
  const client = new Client({ ...DB_CONFIG, database: 'postgres' });
  await client.connect();
  const result = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = 'db_course_project'`
  );
  if (result.rowCount === 0) {
    console.log('📦 Creating database db_course_project ...');
    await client.query('CREATE DATABASE db_course_project');
    console.log('✅ Database created.');
  } else {
    console.log('ℹ️  Database db_course_project already exists.');
  }
  await client.end();
}

async function runSetup() {
  const sqlPath = path.join(__dirname, 'setup.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({ ...DB_CONFIG, database: 'db_course_project' });
  await client.connect();
  console.log('✅ Connected to db_course_project');

  try {
    await client.query(sql);
    console.log('🎉 setup.sql executed successfully!');
  } catch (err) {
    console.error('❌ Error executing setup.sql:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

async function runMigration(sql, params = []) {
  const client = new Client({ ...DB_CONFIG, database: 'db_course_project' });
  await client.connect();
  console.log('✅ Connected to db_course_project');
  try {
    const result = await client.query(sql, params);
    if (result.rows && result.rows.length > 0) console.table(result.rows);
    console.log('🎉 Migration executed successfully!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

(async () => {
  try {
    if (args.includes('--create-db')) {
      await createDatabaseIfNeeded();
    }
    if (args.includes('--inspect')) {
      await runMigration(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, ['users']);
    } else if (args.includes('--migrate')) {
      const idx = args.indexOf('--migrate');
      const sql = args[idx + 1];
      if (!sql) { console.error('Usage: node run_setup.js --migrate "SQL HERE"'); process.exit(1); }
      await runMigration(sql);
    } else {
      await runSetup();
    }
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
})();
