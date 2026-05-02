import redis from '../redis.js';

/**
 * Returns true if the identifier has exceeded the limit (request should be blocked).
 * Uses Redis INCR + EXPIRE: first request in the window sets the TTL,
 * subsequent requests just increment. Atomic and fast.
 */
export async function checkRateLimit(identifier, maxRequests, windowSeconds) {
    try {
        const key = `ratelimit:${identifier}`;
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
        const count = await Promise.race([redis.incr(key), timeout]);
        if (count === 1) {
            await Promise.race([redis.expire(key, windowSeconds), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))]);
        }
        return count > maxRequests;
    } catch {
        return false;
    }
}
