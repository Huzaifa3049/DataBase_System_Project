import { Queue } from "bullmq";
import redisconnection from './redisConnection.js';

export const embeddingQueue = new Queue('embeddings', { connection: redisconnection });
export const tasteProileQueue = new Queue('taste-profile', { connection: redisconnection });

