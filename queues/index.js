import { Queue } from "bullmq";
import redisconnection from './redisConnection.js';

export const embeddingQueue = new Queue('embeddings', { connection: redisconnection });
export const tasteProfileQueue = new Queue('taste-profile', { connection: redisconnection });

