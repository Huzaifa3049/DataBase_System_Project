import jwt from 'jsonwebtoken';
import redis from '../redis.js';

async function authenticateToken(req, res, next) {
    const token = req.cookies.accessToken || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    if (token == null) return res.status(401).json({ error: 'Not authenticated. Please log in.' });

    // Reject tokens that were explicitly invalidated via logout
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) return res.status(401).json({ error: 'Session invalidated. Please log in again.' });

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Session expired. Please log in again.' });
        req.user = user;
        next();
    });
}

export default authenticateToken;
