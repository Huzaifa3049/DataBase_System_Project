import Redis from 'ioredis';

const redisconnection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
});

redisconnection.on('error', (err) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        console.error('❌ Queue Redis error:', err.message);
    }
});

export default redisconnection;
