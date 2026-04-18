import redis from '../redis.js';

/**
 * Returns true if the identifier has exceeded the limit (request should be blocked).
 * Uses Redis INCR + EXPIRE: first request in the window sets the TTL,
 * subsequent requests just increment. Atomic and fast.
 */
export async function checkRateLimit(identifier, maxRequests, windowSeconds) {
    try {
        const key = `ratelimit:${identifier}`;
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, windowSeconds);
        }
        return count > maxRequests;
    } catch {
        return false; // if Redis is down, don't block requests
    }
}
