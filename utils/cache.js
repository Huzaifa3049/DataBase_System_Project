import redis from '../redis.js';


const cacheHelper = {

    async getOrSet(key, fetchFn, ttlSeconds = 60) {
        try {
           
            const cached = await redis.get(key);

            if (cached) {
               
                console.log(`⚡ CACHE HIT: ${key}`);
                return JSON.parse(cached);
            }

           
            console.log(`🐌 CACHE MISS: ${key} — fetching from DB`);
            const freshData = await fetchFn();

           
           
            await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);

            return freshData;
        } catch (err) {
           
            console.error('⚠️ Redis error, falling back to DB:', err.message);
            return await fetchFn();
        }
    },

    async invalidate(key) {
        try {
            await redis.del(key);
            console.log(`🗑️ CACHE INVALIDATED: ${key}`);
        } catch (err) {
            console.error('⚠️ Redis invalidation error:', err.message);
        }
    },

    async invalidatePattern(pattern) {
        try {
           
           
            const keys = await new Promise((resolve, reject) => {
                const found = [];
                const stream = redis.scanStream({ match: pattern, count: 100 });
                stream.on('data', (batch) => found.push(...batch));
                stream.on('end', () => resolve(found));
                stream.on('error', reject);
            });
            if (keys.length > 0) {
                await redis.del(...keys);
                console.log(`🗑️ CACHE INVALIDATED: ${keys.length} keys matching "${pattern}"`);
            }
        } catch (err) {
            console.error('⚠️ Redis pattern invalidation error:', err.message);
        }
    }
};

export default cacheHelper;
