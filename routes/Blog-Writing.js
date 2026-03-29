import express from 'express';
import pool from '../db.js';
import authenticateToken from '../middleware/authorization.js';
const blog_router = express.Router(); 


blog_router.post('/create', authenticateToken, async (req, res) => {
    const { title, content } = req.body;
    const author_id = req.user.id; // Get ID from the authenticated token
    
    try {
        // Step 1: Insert into blogs table
        const blogQuery = 'INSERT INTO blogs (title, author_id) VALUES ($1, $2) RETURNING id';
        const blogResult = await pool.query(blogQuery, [title, author_id]);
        const blogId = blogResult.rows[0].id;
        
        // Step 2: Insert content into blog_versions table
        const versionQuery = `
            INSERT INTO blog_versions (blog_id, version_number, content, parent_version_id)
            VALUES ($1, 1, $2, NULL)
            RETURNING id
        `;
        const versionResult = await pool.query(versionQuery, [blogId, content]);
        const versionId = versionResult.rows[0].id;
        
        // Step 3: Link the version to the blog
        const updateQuery = 'UPDATE blogs SET current_version_id = $1 WHERE id = $2';
        await pool.query(updateQuery, [versionId, blogId]);
        
        res.status(201).json({ 
            message: 'Blog created successfully', 
            blog_id: blogId, 
            version_id: versionId 
        });
    } catch (error) {
        console.error('Error creating blog post:', error);
        res.status(500).json({ error: 'Internal server error' });
    }

});


export default blog_router; 