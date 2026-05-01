import pg from 'pg';
const { Client } = pg;

const client = new Client({
  user: 'postgres', host: 'localhost',
  password: '123', port: 5432,
  database: 'db_course_project'
});

await client.connect();

// 1. Check users.id type
const colRes = await client.query(`
  SELECT column_name, data_type, udt_name
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'id'
`);
console.log('users.id type:', colRes.rows[0]);

// 2. List all tables
const tabRes = await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`);
console.log('Tables:', tabRes.rows.map(r => r.table_name).join(', '));

// 3. Check follows table if it exists
const fRes = await client.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'follows' ORDER BY ordinal_position
`);
if (fRes.rows.length) {
  console.log('follows columns:', fRes.rows);
} else {
  console.log('follows table does not exist yet');
}

await client.end();
