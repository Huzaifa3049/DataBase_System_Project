import pool from './db.js';

const q = `
    SELECT b.id AS blog_id, b.title, 
           CASE WHEN bl.user_id IS NOT NULL THEN true ELSE false END AS liked
    FROM blogs b 
    LEFT JOIN blog_likes bl ON bl.blog_id = b.id AND bl.user_id = 1 
    WHERE b.is_published = TRUE AND b.is_deleted = FALSE 
    LIMIT 1
`;

pool.query(q).then(r => {
    console.log('Query OK:', r.rows);
    process.exit(0);
}).catch(e => {
    console.log('ERROR:', e.message);
    process.exit(1);
});
