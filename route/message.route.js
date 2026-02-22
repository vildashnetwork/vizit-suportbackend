import express from "express";
import {
    getUsersForSidebar,
    getMessages,
    sendMessage,
    markMessagesAsRead,
    deleteMessage,
    editMessage,
    getUnreadCount,
    searchMessages
} from "./controllers/message.controller.js";

const router = express.Router();

// Get users for sidebar
router.get("/users/:loggedInUserId", getUsersForSidebar);

// Get messages between users
router.get("/:id", getMessages);

// Send message
router.post("/send/:id", sendMessage);

// Mark messages as read
router.patch("/read/:chatUserId", markMessagesAsRead);

// Delete message
router.delete("/:messageId", deleteMessage);

// Edit message
router.patch("/:messageId", editMessage);

// Get unread count
router.get("/unread/:userId", getUnreadCount);

// Search messages
router.get("/search/all", searchMessages);

export default router;