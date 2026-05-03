import express from 'express';
import pool from '../db.js';
import authenticateToken from '../middleware/authorization.js';

const router = express.Router();

router.post('/:targetUserId', authenticateToken, async (req, res, next) => {
    const followerId = req.user.id;
    const { targetUserId } = req.params;

    if (followerId === targetUserId) {
        return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    try {
        await pool.query(
            'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [followerId, targetUserId]
        );
        res.status(200).json({ message: 'Followed successfully' });
    } catch (error) {
        next(error);
    }
});

router.delete('/:targetUserId', authenticateToken, async (req, res, next) => {
    const followerId = req.user.id;
    const { targetUserId } = req.params;

    try {
        await pool.query(
            'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
            [followerId, targetUserId]
        );
        res.status(200).json({ message: 'Unfollowed successfully' });
    } catch (error) {
        next(error);
    }
});

router.get('/:userId/is-following', authenticateToken, async (req, res, next) => {
    const followerId = req.user.id;
    const { userId } = req.params;

    try {
        const result = await pool.query(
            'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
            [followerId, userId]
        );
        res.json({ following: result.rows.length > 0 });
    } catch (error) {
        next(error);
    }
});

router.get('/:userId/stats', async (req, res, next) => {
    const { userId } = req.params;

    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM follows WHERE following_id = $1) AS followers,
                (SELECT COUNT(*) FROM follows WHERE follower_id = $1) AS following
        `, [userId]);

        res.status(200).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

export default router;
