import Redis from 'ioredis';

// Connect to Memurai (Redis-compatible) on default port 6379
const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    // no password needed for local Memurai dev setup
});

redis.on('connect', () => {
    console.log('✅ Redis (Memurai) connected successfully');
});

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

export default redis;
