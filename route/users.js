import express from 'express';
import Users from '../model/usersforsuport.js';


const router = express.Router();

/**
 * LOGIN OR CREATE USER
 * This works perfectly with LocalStorage on the frontend.
 */
router.post('/log-add', async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) return res.status(400).json({ message: "Name is required" });

        // 1. Check if this exact name already exists
        let user = await Users.findOne({ name });

        if (user) {
            // User exists, return the existing user so frontend can store the ID
            return res.status(200).json({
                message: 'Login successful',
                user
            });
        } else {
            // 2. If new, add random letters to ensure uniqueness in your DB
            const randomLetters = Math.random().toString(36).substring(2, 5).toUpperCase();
            const uniqueName = `${name}#${randomLetters}`;

            const newUser = new Users({
                name: uniqueName,
                profile: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00976a&color=fff&size=128`,

            });

            await newUser.save();

            // 3. Send the NEW user back. Frontend must save this 'uniqueName' and '_id'
            res.status(201).json({
                message: 'User created successfully',
                user: newUser
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error processing user', error: error.message });
    }
});

// GET user by ID (better for persistent chat than name)
router.get("/get-user/:id", async (req, res) => {
    try {
        const user = await Users.findById(req.params.id);
        if (user) {
            res.status(200).json({ user });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
});

export default router;