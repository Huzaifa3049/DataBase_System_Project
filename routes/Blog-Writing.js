import express from 'express';
import pool from '../db.js';
import authenticateToken from '../middleware/authorization.js';
import RecommenderService from '../utils/recommender.js';
import cacheHelper from '../utils/cache.js';
import { embeddingQueue } from '../queues/index.js';

const blog_router = express.Router();

blog_router.post('/create', authenticateToken, async (req, res, next) => {
    const { title, content } = req.body;
    const author_id = req.user.id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const blogResult = await client.query(
            'INSERT INTO blogs (title, author_id) VALUES ($1, $2) RETURNING id',
            [title, author_id]
        );
        const blogId = blogResult.rows[0].id;

        // content_embedding starts NULL — worker fills it in background
        const versionResult = await client.query(
            `INSERT INTO blog_versions (blog_id, version_number, content, parent_version_id)
             VALUES ($1, 1, $2, NULL) RETURNING id`,
            [blogId, content]
        );
        const versionId = versionResult.rows[0].id;

        await client.query(
            'UPDATE blogs SET current_version_id = $1 WHERE id = $2',
            [versionId, blogId]
        );

        await client.query(
            'INSERT INTO published_versions (blog_id, version_id) VALUES ($1, $2)',
            [blogId, versionId]
        );

        await client.query('COMMIT');

        // Queue embedding — runs in background, user already has response
        await embeddingQueue.add('generate', { blogId, versionId, title, content });

        res.status(201).json({
            message: 'Blog created successfully',
            blog_id: blogId,
            version_id: versionId
        });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

blog_router.post('/save-draft', authenticateToken, async (req, res, next) => {
    const { title, content, create_version } = req.body;
    let { blog_id } = req.body;
    const author_id = req.user.id;

    // On manual saves, generate the embedding BEFORE opening the transaction
    // (slow external call — must not block a DB connection while it runs)
    let vectorString = null;
    if (create_version) {
        try {
            const embeddingArray = await RecommenderService.generateEmbedding((title || '') + ' ' + (content || ''));
            vectorString = `[${embeddingArray.join(',')}]`;
        } catch (error) {
            return next(error);
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Step 1: Create or update the blog row
        if (!blog_id) {
            const insertBlog = await client.query(
                'INSERT INTO blogs (title, author_id, is_published) VALUES ($1, $2, FALSE) RETURNING id',
                [title, author_id]
            );
            blog_id = insertBlog.rows[0].id;
        } else {
            await client.query(
                'UPDATE blogs SET title = $1 WHERE id = $2 AND author_id = $3',
                [title, blog_id, author_id]
            );
        }

        // Step 2: Get the latest existing version for this blog
        const latestVersion = await client.query(
            'SELECT id, version_number FROM blog_versions WHERE blog_id = $1 ORDER BY version_number DESC LIMIT 1',
            [blog_id]
        );

        let versionId;
        let versionNumber;
        let isNewVersion = false;

        if (create_version || latestVersion.rows.length === 0) {
            // ── MANUAL SAVE or FIRST-EVER SAVE ──
            versionNumber = latestVersion.rows.length > 0
                ? latestVersion.rows[0].version_number + 1
                : 1;

            // vectorString was already generated above, before the transaction
            const insertVersion = await client.query(
                'INSERT INTO blog_versions (blog_id, version_number, title, content, content_embedding) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [blog_id, versionNumber, title, content, vectorString]
            );
            versionId = insertVersion.rows[0].id;
            isNewVersion = true;

        } else {
            // ── AUTO-SAVE ──
            versionId = latestVersion.rows[0].id;
            versionNumber = latestVersion.rows[0].version_number;

            await client.query(
                'UPDATE blog_versions SET title = $1, content = $2 WHERE id = $3',
                [title, content, versionId]
            );
        }

        // Step 3: Point the blog to whichever version we just wrote to
        await client.query('UPDATE blogs SET current_version_id = $1 WHERE id = $2', [versionId, blog_id]);

        await client.query('COMMIT');

        res.status(200).json({
            blog_id,
            version_number: versionNumber,
            is_new_version: isNewVersion
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

blog_router.get('/my-drafts', authenticateToken, async (req, res, next) => {
    const author_id = req.user.id;
    try {
        const query = `
            SELECT b.id as blog_id, b.title, bv.content, b.created_at 
            FROM blogs b 
            LEFT JOIN blog_versions bv ON b.current_version_id = bv.id 
            WHERE b.author_id = $1 AND b.is_published = FALSE AND b.is_deleted = FALSE 
            ORDER BY b.created_at DESC
        `;
        const result = await pool.query(query, [author_id]);
        res.status(200).json({ drafts: result.rows });
    } catch (err) {
        next(err);
    }
});

blog_router.get('/my-published', authenticateToken, async (req, res, next) => {
    const author_id = req.user.id;
    try {
        const query = `
            SELECT b.id as blog_id, b.title, bv.content, b.created_at 
            FROM blogs b 
            LEFT JOIN blog_versions bv ON b.current_version_id = bv.id 
            WHERE b.author_id = $1 AND b.is_published = TRUE AND b.is_deleted = FALSE 
            ORDER BY b.created_at DESC
        `;
        const result = await pool.query(query, [author_id]);
        res.status(200).json({ blogs: result.rows });
    } catch (err) {
        next(err);
    }
});

blog_router.get('/my-liked', authenticateToken, async (req, res, next) => {
    const user_id = req.user.id;
    try {
        const query = `
            SELECT b.id as blog_id, b.title, bv.content, b.created_at 
            FROM blog_likes bl 
            JOIN blogs b ON bl.blog_id = b.id 
            JOIN blog_versions bv ON b.current_version_id = bv.id 
            WHERE bl.user_id = $1 AND b.is_published = TRUE AND b.is_deleted = FALSE 
            ORDER BY b.created_at DESC
        `;
        const result = await pool.query(query, [user_id]);
        res.status(200).json({ blogs: result.rows });
    } catch (err) {
        next(err);
    }
});

// Personalized Feed Route
// CACHE STRATEGY: Two different cache keys:
//   - Users WITH taste_profile:  "feed:user:{userId}:page:{page}"  (personalized, 60s TTL)
//   - Users WITHOUT taste_profile: "feed:global:page:{page}"       (shared, 90s TTL)
//
// WHY different keys?
//   User A's personalized feed is different from User B's.
//   But ALL users without a taste profile see the same chronological feed,
//   so they can safely share one cached result.
blog_router.get('/feed', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        // First check: does this user have a taste profile?
        const userResult = await pool.query('SELECT taste_profile FROM users WHERE id = $1', [userId]);
        const tasteProfile = userResult.rows[0]?.taste_profile;

        let cacheKey;
        let ttl;

        if (tasteProfile) {
            // Personalized feed — unique per user
            cacheKey = `feed:user:${userId}:page:${page}`;
            ttl = 60;  // shorter TTL because personalized data changes more often
        } else {
            // Global feed — shared across all users without profiles
            cacheKey = `feed:global:page:${page}`;
            ttl = 90;  // longer TTL because it's the same for everyone
        }

        const feedData = await cacheHelper.getOrSet(
            cacheKey,
            async () => {
                // ── This entire block only runs on CACHE MISS ──
                let feedQuery;
                let queryVariables;

                if (tasteProfile) {
                    feedQuery = `
                         SELECT 
                             b.id as blog_id, 
                             b.title, 
                             bv.content, 
                             (bv.content_embedding <=> u.taste_profile) as similarity_score
                         FROM blogs b
                         JOIN blog_versions bv ON b.current_version_id = bv.id
                         CROSS JOIN users u
                         WHERE u.id = $1 
                           AND b.is_published = TRUE 
                           AND b.is_deleted = FALSE
                           AND b.id NOT IN (SELECT blog_id FROM blog_likes WHERE user_id = $1) 
                         ORDER BY similarity_score ASC 
                         LIMIT $2 OFFSET $3;
                     `;
                    queryVariables = [userId, limit, offset];
                } else {
                    feedQuery = `
                         SELECT 
                             b.id as blog_id, 
                             b.title, 
                             bv.content 
                         FROM blogs b
                         JOIN blog_versions bv ON b.current_version_id = bv.id
                         WHERE b.is_published = TRUE 
                           AND b.is_deleted = FALSE 
                         ORDER BY b.created_at DESC 
                         LIMIT $1 OFFSET $2;
                     `;
                    queryVariables = [limit, offset];
                }

                const feedResult = await pool.query(feedQuery, queryVariables);
                return feedResult.rows;
            },
            ttl
        );

        res.status(200).json({
            message: "Feed fetched successfully",
            feed: feedData,
            page
        });

    } catch (error) {
        next(error);
    }
});

// Route to toggle Like / Unlike a blog
blog_router.post('/like/:blog_id', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;
    const blogId = req.params.blog_id;

    try {
        // Check if already liked — SELECT 1 is the correct pattern for existence checks,
        // we only need rows.length, not any column value
        const existing = await pool.query(
            'SELECT 1 FROM blog_likes WHERE user_id = $1 AND blog_id = $2',
            [userId, blogId]
        );

        let liked;
        if (existing.rows.length > 0) {
            // Unlike — delete the row (trigger decrements likes_count)
            await pool.query(
                'DELETE FROM blog_likes WHERE user_id = $1 AND blog_id = $2',
                [userId, blogId]
            );
            liked = false;
        } else {
            // Like — insert (trigger increments likes_count)
            await pool.query(
                'INSERT INTO blog_likes (user_id, blog_id) VALUES ($1, $2)',
                [userId, blogId]
            );
            liked = true;

            // Notify the blog author (only on like, not unlike)
            const blogOwner = await pool.query('SELECT author_id FROM blogs WHERE id = $1', [blogId]);
            if (blogOwner.rows.length > 0 && blogOwner.rows[0].author_id !== userId) {
                await pool.query(
                    'INSERT INTO notifications (recipient_id, actor_id, blog_id, type) VALUES ($1, $2, $3, $4)',
                    [blogOwner.rows[0].author_id, userId, blogId, 'like']
                );
            }
        }

        // Update taste profile
        const tasteProfileQuery = `
            UPDATE users 
            SET taste_profile = (
                SELECT AVG(bv.content_embedding) 
                FROM blog_likes bl
                JOIN published_versions pv ON bl.blog_id = pv.blog_id
                JOIN blog_versions bv ON pv.version_id = bv.id
                WHERE bl.user_id = $1
            )
            WHERE id = $1;
        `;
        await pool.query(tasteProfileQuery, [userId]);

        // Get updated count
        const countResult = await pool.query('SELECT likes_count FROM blogs WHERE id = $1', [blogId]);

        // Invalidate cache — likes_count changed!
        await cacheHelper.invalidate(`blog:${blogId}`);
        // Invalidate THIS user's personalized feed (liked blog should disappear from it)
        await cacheHelper.invalidatePattern(`feed:user:${userId}:*`);

        res.status(200).json({
            message: liked ? 'Blog liked!' : 'Blog unliked!',
            liked,
            likes_count: countResult.rows[0].likes_count
        });
    } catch (error) {
        next(error);
    }
});

blog_router.post('/publish/:blog_id', authenticateToken, async (req, res, next) => {
    const blogId = req.params.blog_id;
    const userId = req.user.id;

    // Read-only check happens outside the transaction — no point locking rows for a SELECT
    const blogResult = await pool.query(
        'SELECT id, current_version_id, is_published FROM blogs WHERE id = $1 AND author_id = $2',
        [blogId, userId]
    );

    if (blogResult.rows.length === 0) {
        return res.status(404).json({ message: 'Blog not found or not owned by you' });
    }

    const blog = blogResult.rows[0];

    if (blog.is_published) {
        return res.status(400).json({ message: 'Blog is already published' });
    }

    // The UPDATE and INSERT must succeed together — if published_versions insert fails,
    // the blog must not be left in is_published=TRUE with no published_versions record
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('UPDATE blogs SET is_published = TRUE WHERE id = $1', [blogId]);

        await client.query(
            'INSERT INTO published_versions (blog_id, version_id) VALUES ($1, $2)',
            [blogId, blog.current_version_id]
        );

        await client.query('COMMIT');

        await cacheHelper.invalidatePattern(`author:${userId}:*`);
        await cacheHelper.invalidatePattern(`feed:*`);

        res.status(200).json({ message: 'Blog published successfully', blog_id: blogId });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

blog_router.get('/search', async (req, res, next) => {
    const searchQuery = req.query.q;

    if (!searchQuery) {
        return res.status(400).json({
            "message": "Please provide a search query"
        });
    }

    try {
        const search_in_title = `
            SELECT
                b.id as blog_id,
                b.title,
                bv.content
            FROM blogs b
            JOIN blog_versions bv ON b.current_version_id = bv.id
            WHERE b.title ILIKE $1
              AND b.is_published = TRUE
              AND b.is_deleted = FALSE
            LIMIT 10;
        `;
        const titleResults = await pool.query(search_in_title, [`%${searchQuery}%`]);

        if (titleResults.rows.length > 0) {
            return res.status(200).json({
                "message": "Search results fetched successfully (Title Match)",
                "results": titleResults.rows
            });
        }
        const embedded_query = await RecommenderService.generateEmbedding(searchQuery);
        const vectorString = `[${embedded_query.join(',')}]`;

        const search_query = `
            SELECT 
                b.id as blog_id,
                b.title,
                bv.content,
                (bv.content_embedding <=> $1) as similarity_score
            FROM blogs b
            JOIN blog_versions bv ON b.current_version_id = bv.id
            WHERE b.is_published = TRUE
            AND b.is_deleted = FALSE
            ORDER BY similarity_score ASC
            LIMIT 10;
        `;

        const result = await pool.query(search_query, [vectorString]);

        return res.status(200).json({
            "message": "Search results fetched successfully",
            "results": result.rows
        });

    } catch (error) {
        next(error);
    }
});

// GET full blog for the reader page (with Redis caching)
blog_router.get('/read/:blog_id', authenticateToken, async (req, res, next) => {
    const blogId = req.params.blog_id;
    const userId = req.user.id;

    try {
        // ── CACHED: Blog content (same for all users) ──
        // Key format: "blog:<uuid>" — cached for 120 seconds
        const blogData = await cacheHelper.getOrSet(
            `blog:${blogId}`,
            async () => {
                // This function ONLY runs on cache miss
                const query = `
                    SELECT 
                        b.id AS blog_id,
                        b.title,
                        bv.content,
                        b.likes_count,
                        b.comments_count,
                        b.created_at,
                        b.author_id,
                        u.username AS author
                    FROM blogs b
                    JOIN blog_versions bv ON b.current_version_id = bv.id
                    JOIN users u ON b.author_id = u.id
                    WHERE b.id = $1 
                      AND b.is_published = TRUE 
                      AND b.is_deleted = FALSE
                `;
                const result = await pool.query(query, [blogId]);
                return result.rows[0] || null;
            },
            120  // TTL: 2 minutes
        );

        if (!blogData) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        // ── NOT CACHED: User-specific data (different per user) ──
        const likeCheck = await pool.query(
            'SELECT 1 FROM blog_likes WHERE user_id = $1 AND blog_id = $2',
            [userId, blogId]
        );
        const liked_by_user = likeCheck.rows.length > 0;

        // Merge cached blog data + live user data
        res.status(200).json({
            ...blogData,
            liked_by_user,
            current_user_id: userId
        });
    } catch (err) {
        next(err);
    }
});

blog_router.get('/:blog_id/versions', authenticateToken, async (req, res, next) => {
    const { blog_id } = req.params;
    const user_id = req.user.id;

    try {
        const checkBlog = await pool.query('SELECT id FROM blogs WHERE id = $1 AND author_id = $2', [blog_id, user_id]);

        if (checkBlog.rows.length === 0) {
            return res.status(403).json({
                error: "Access Denied"
            });
        }

        const getVersions = 'SELECT version_number, created_at FROM blog_versions WHERE blog_id = $1 ORDER BY version_number DESC';
        const versions = await pool.query(getVersions, [blog_id]);
        res.status(200).json({
            versions: versions.rows
        })
    }
    catch (err) {
        next(err);
    }
});

blog_router.get('/:blog_id/versions/:version_number', authenticateToken, async (req, res, next) => {
    const { blog_id, version_number } = req.params;
    const author_id = req.user.id;

    try {
        const checkBlog = await pool.query('SELECT id FROM blogs WHERE id = $1 AND author_id = $2', [blog_id, author_id]);
        if (checkBlog.rows.length === 0) return res.status(403).json({ error: "Access denied" });

        const contentQuery = `
            SELECT title, content 
            FROM blog_versions 
            WHERE blog_id = $1 AND version_number = $2
        `;
        const result = await pool.query(contentQuery, [blog_id, version_number]);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: "Version not found" });
        }
    } catch (err) {
        next(err);
    }
});

// ── POST a comment on a blog ──
blog_router.post('/comment/:blog_id', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;
    const blogId = req.params.blog_id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    try {
        // Insert the comment
        const insertQuery = `
            INSERT INTO blog_comments (blog_id, user_id, content)
            VALUES ($1, $2, $3)
            RETURNING id, content, created_at
        `;
        const result = await pool.query(insertQuery, [blogId, userId, content.trim()]);

        // Note: comments_count is auto-incremented by the DB trigger

        // Get the username so the frontend can display it immediately
        const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);

        // Notify the blog author (skip if commenter IS the author)
        const blogOwner = await pool.query('SELECT author_id FROM blogs WHERE id = $1', [blogId]);
        if (blogOwner.rows.length > 0 && blogOwner.rows[0].author_id !== userId) {
            await pool.query(
                'INSERT INTO notifications (recipient_id, actor_id, blog_id, type) VALUES ($1, $2, $3, $4)',
                [blogOwner.rows[0].author_id, userId, blogId, 'comment']
            );
        }

        // Invalidate cache — comments_count changed!
        await cacheHelper.invalidate(`blog:${blogId}`);

        res.status(201).json({
            message: 'Comment added',
            comment: {
                ...result.rows[0],
                username: userResult.rows[0].username
            }
        });
    } catch (error) {
        next(error);
    }
});

// ── GET all comments for a blog (with pagination) ──
blog_router.get('/comments/:blog_id', authenticateToken, async (req, res, next) => {
    const blogId = req.params.blog_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        const query = `
            SELECT 
                bc.id,
                bc.content,
                bc.created_at,
                bc.user_id,
                u.username
            FROM blog_comments bc
            JOIN users u ON bc.user_id = u.id
            WHERE bc.blog_id = $1
            ORDER BY bc.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [blogId, limit, offset]);

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM blog_comments WHERE blog_id = $1', [blogId]
        );
        const total = parseInt(countResult.rows[0].count);

        res.status(200).json({
            comments: result.rows,
            pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        next(error);
    }
});

// ── DELETE a comment ──
blog_router.delete('/comment/:comment_id', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;
    const commentId = req.params.comment_id;

    try {
        // Only the comment author or the blog author can delete
        const comment = await pool.query(
            `SELECT bc.id, bc.blog_id, bc.user_id, b.author_id 
             FROM blog_comments bc JOIN blogs b ON bc.blog_id = b.id 
             WHERE bc.id = $1`,
            [commentId]
        );

        if (comment.rows.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        const c = comment.rows[0];
        if (c.user_id !== userId && c.author_id !== userId) {
            return res.status(403).json({ error: 'Not authorized to delete this comment' });
        }

        // Delete (trigger decrements comments_count)
        await pool.query('DELETE FROM blog_comments WHERE id = $1', [commentId]);

        // Invalidate cache — comments_count changed!
        await cacheHelper.invalidate(`blog:${c.blog_id}`);

        res.status(200).json({ message: 'Comment deleted' });
    } catch (error) {
        next(error);
    }
});

// ── GET notifications (with pagination) ──
blog_router.get('/notifications', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        const query = `
            SELECT 
                n.id,
                n.type,
                n.is_read,
                n.created_at,
                n.blog_id,
                b.title AS blog_title,
                u.username AS actor_name
            FROM notifications n
            JOIN users u ON n.actor_id = u.id
            JOIN blogs b ON n.blog_id = b.id
            WHERE n.recipient_id = $1
            ORDER BY n.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);

        const unreadResult = await pool.query(
            'SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND is_read = FALSE',
            [userId]
        );

        res.status(200).json({
            notifications: result.rows,
            unread_count: parseInt(unreadResult.rows[0].count)
        });
    } catch (error) {
        next(error);
    }
});

// ── PATCH mark all notifications as read ──
blog_router.patch('/notifications/read', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;

    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE recipient_id = $1 AND is_read = FALSE',
            [userId]
        );
        res.status(200).json({ message: 'All notifications marked as read' });
    } catch (error) {
        next(error);
    }
});

// ── Soft-delete a blog ──
blog_router.delete('/delete/:blog_id', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;
    const blogId = req.params.blog_id;

    try {
        const result = await pool.query(
            'UPDATE blogs SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND author_id = $2 AND is_deleted = FALSE RETURNING id',
            [blogId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Blog not found or already deleted' });
        }

        // Invalidate cache — blog deleted!
        await cacheHelper.invalidate(`blog:${blogId}`);
        // Also invalidate author page (blog count changed)
        await cacheHelper.invalidatePattern(`author:${userId}:*`);

        res.status(200).json({ message: 'Blog deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ── Edit a published blog (creates new version & re-publishes) ──
blog_router.put('/edit/:blog_id', authenticateToken, async (req, res, next) => {
    const userId = req.user.id;
    const blogId = req.params.blog_id;
    const { title, content } = req.body;

    // Read-only checks happen outside the transaction
    const blog = await pool.query(
        'SELECT id, current_version_id FROM blogs WHERE id = $1 AND author_id = $2 AND is_deleted = FALSE',
        [blogId, userId]
    );

    if (blog.rows.length === 0) {
        return res.status(404).json({ error: 'Blog not found or not owned by you' });
    }

    const latestVersion = await pool.query(
        'SELECT version_number FROM blog_versions WHERE blog_id = $1 ORDER BY version_number DESC LIMIT 1',
        [blogId]
    );
    const newVersionNumber = (latestVersion.rows[0]?.version_number || 0) + 1;

    // Generate embedding BEFORE opening the transaction
    let vectorString;
    try {
        const embeddingArray = await RecommenderService.generateEmbedding((title || '') + ' ' + (content || ''));
        vectorString = `[${embeddingArray.join(',')}]`;
    } catch (error) {
        return next(error);
    }

    // The 3 writes (new version, update blog pointer, record in published_versions)
    // must all succeed or all be rolled back
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const versionResult = await client.query(
            'INSERT INTO blog_versions (blog_id, version_number, title, content, parent_version_id, content_embedding) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [blogId, newVersionNumber, title, content, blog.rows[0].current_version_id, vectorString]
        );
        const newVersionId = versionResult.rows[0].id;

        await client.query(
            'UPDATE blogs SET title = $1, current_version_id = $2 WHERE id = $3',
            [title, newVersionId, blogId]
        );

        await client.query(
            'INSERT INTO published_versions (blog_id, version_id) VALUES ($1, $2)',
            [blogId, newVersionId]
        );

        await client.query('COMMIT');

        await cacheHelper.invalidate(`blog:${blogId}`);
        await cacheHelper.invalidatePattern(`author:${userId}:*`);

        res.status(200).json({
            message: 'Blog updated successfully',
            blog_id: blogId,
            version_number: newVersionNumber
        });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

// ── GET blogs by a specific author (public author page) ──
// CACHE KEY: "author:{id}:page:{page}" — cached for 90 seconds
// WHY: The author page runs 3 queries (author info + blogs + count).
//       Caching the whole response avoids all 3 on repeat visits.
// INVALIDATION: When this author publishes/deletes/edits a blog,
//               we call invalidatePattern("author:{id}:*") to wipe all pages.
blog_router.get('/author/:author_id', async (req, res, next) => {
    const authorId = req.params.author_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        // Cache key includes page number — each page is cached separately
        const cacheKey = `author:${authorId}:page:${page}`;

        const data = await cacheHelper.getOrSet(
            cacheKey,
            async () => {
                // ── All 3 queries only run on CACHE MISS ──

                // Query 1: Author info
                const authorResult = await pool.query(
                    'SELECT id, username, created_at FROM users WHERE id = $1',
                    [authorId]
                );

                if (authorResult.rows.length === 0) {
                    return null; // author not found
                }

                // Query 2: Their published blogs (paginated)
                const blogsResult = await pool.query(
                    `SELECT b.id AS blog_id, b.title, bv.content, b.likes_count, b.comments_count, b.created_at
                     FROM blogs b
                     JOIN blog_versions bv ON b.current_version_id = bv.id
                     WHERE b.author_id = $1 AND b.is_published = TRUE AND b.is_deleted = FALSE
                     ORDER BY b.created_at DESC
                     LIMIT $2 OFFSET $3`,
                    [authorId, limit, offset]
                );

                // Query 3: Total count for pagination
                const countResult = await pool.query(
                    'SELECT COUNT(*) FROM blogs WHERE author_id = $1 AND is_published = TRUE AND is_deleted = FALSE',
                    [authorId]
                );

                return {
                    author: authorResult.rows[0],
                    blogs: blogsResult.rows,
                    pagination: {
                        page, limit,
                        total: parseInt(countResult.rows[0].count),
                        total_pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
                    }
                };
            },
            90  // TTL: 90 seconds
        );

        if (!data) {
            return res.status(404).json({ error: 'Author not found' });
        }

        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
});

export default blog_router;