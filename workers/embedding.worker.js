import { Worker } from 'bullmq';
import redisconnection from '../queues/redisConnection.js';
import pool from '../db.js';
import RecommenderService from '../utils/recommender.js';

const worker = new Worker('embeddings', async (job) => {
    const { blogId, versionId, title, content } = job.data;

    const embeddingArray = await RecommenderService.generateEmbedding(title + content);
    const vectorString = `[${embeddingArray.join(',')}]`;

    await pool.query(
        'UPDATE blog_versions SET content_embedding = $1 WHERE id = $2',
        [vectorString, versionId]
    );

    console.log(`✅ Embedding generated for blog ${blogId}`);
}, { connection: redisconnection });

worker.on('failed', (job, err) => {
    console.error(`❌ Embedding job failed for blog ${job.data.blogId}:`, err.message);
});

export default worker; 