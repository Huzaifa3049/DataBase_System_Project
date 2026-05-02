import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 3000,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    reconnectOnError: () => true,
});

redis.on('connect', () => console.log('✅ Redis connected successfully'));
redis.on('error', (err) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        console.error('❌ Redis error:', err.message);
    }
});

export default redis;
