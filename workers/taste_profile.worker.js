import { Worker } from 'bullmq';
import redisconnection from '../queues/redisConnection.js';
import pool from '../db.js';

const worker = new Worker('taste-profile', async (job) => {
    const { userId } = job.data;

    await pool.query(`
          UPDATE users
          SET taste_profile = (
              SELECT AVG(bv.content_embedding)
              FROM blog_likes bl
              JOIN published_versions pv ON bl.blog_id = pv.blog_id
              JOIN blog_versions bv ON pv.version_id = bv.id
              WHERE bl.user_id = $1
          )
          WHERE id = $1
      `, [userId]);

    console.log(`✅ Taste profile updated for user ${userId}`);
}, { connection: redisconnection });

worker.on('failed', (job, err) => {
    console.error(`❌ Taste profile job failed for user ${job.data.userId}:`, err.message);
});



export default worker;