import redis from '../redis.js';

/**
 * Cache Helper — wraps the "check cache → miss → query DB → store in cache" pattern.
 * 
 * HOW IT WORKS:
 * 
 *   1. You give it a KEY (e.g., "blog:abc-123") and a FUNCTION that fetches from DB.
 *   2. It checks Redis first:
 *      - HIT  → returns cached data instantly (skips DB entirely)
 *      - MISS → calls your function, stores the result in Redis with a TTL, returns it
 *   3. TTL (Time To Live) = how many seconds the cache lives before auto-expiring.
 * 
 * EXAMPLE:
 *   const blog = await cacheHelper.getOrSet(
 *       `blog:${blogId}`,           // key
 *       () => fetchBlogFromDB(id),   // function to call on cache miss
 *       60                           // cache for 60 seconds
 *   );
 */

const cacheHelper = {

    /**
     * Get from cache, or set it by calling the fetchFn.
     * @param {string} key - Redis key (e.g., "blog:some-uuid")
     * @param {Function} fetchFn - async function that returns data from DB
     * @param {number} ttlSeconds - how long to cache (default 60s)
     * @returns {any} - the data (from cache or freshly fetched)
     */
    async getOrSet(key, fetchFn, ttlSeconds = 60) {
        try {
            // Step 1: Check if this key exists in Redis
            const cached = await redis.get(key);

            if (cached) {
                // CACHE HIT — parse JSON and return immediately
                console.log(`⚡ CACHE HIT: ${key}`);
                return JSON.parse(cached);
            }

            // CACHE MISS — call the actual DB query
            console.log(`🐌 CACHE MISS: ${key} — fetching from DB`);
            const freshData = await fetchFn();

            // Store in Redis with TTL (auto-expires after ttlSeconds)
            // EX = "expire in N seconds"
            await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);

            return freshData;
        } catch (err) {
            // If Redis itself is down, fall back to DB (don't break the app)
            console.error('⚠️ Redis error, falling back to DB:', err.message);
            return await fetchFn();
        }
    },

    /**
     * Delete a specific key from cache (called when data changes).
     * This is "cache invalidation" — the hardest problem in CS!
     * @param {string} key - Redis key to delete
     */
    async invalidate(key) {
        try {
            await redis.del(key);
            console.log(`🗑️ CACHE INVALIDATED: ${key}`);
        } catch (err) {
            console.error('⚠️ Redis invalidation error:', err.message);
        }
    },

    /**
     * Delete ALL keys matching a pattern (e.g., "blog:*" deletes all blog caches).
     * Useful when something changes that affects many cached pages.
     * @param {string} pattern - Redis key pattern (e.g., "feed:*")
     */
    async invalidatePattern(pattern) {
        try {
            // scanStream is non-blocking — unlike redis.keys() which blocks Redis
            // while scanning all keys (dangerous at scale with millions of keys)
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
