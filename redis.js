import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
});

redis.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        console.error('❌ Redis connection error:', err.message);
    }
});

export default redis;
