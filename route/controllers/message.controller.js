import { getReceiverSocketId, io } from "../../socket.js";
import Message from "../../model/message.model.js";
import Admin from "../../model/addming.js";
import Users from "../../model/usersforsuport.js";

/**
 * GET USERS FOR SIDEBAR
 * Fetches the list of contacts for the logged-in user or admin
 */
export const getUsersForSidebar = async (req, res) => {
    try {
        const { loggedInUserId } = req.params;

        // Find the record in either Admin or Users collection
        const me = await Admin.findById(loggedInUserId) || await Users.findById(loggedInUserId);

        if (!me) {
            return res.status(404).json({ message: "User not found" });
        }

        // Fetch profiles of people in the chat history
        const filteredUsers = await Users.find().select('-password');
        const filteredAdmins = await Admin.find().select('-password');

        // Get last message for each user
        const usersWithLastMessage = await Promise.all(
            filteredUsers.map(async (user) => {
                const lastMessage = await Message.findOne({
                    $or: [
                        { senderId: loggedInUserId, receiverId: user._id },
                        { senderId: user._id, receiverId: loggedInUserId }
                    ]
                }).sort({ createdAt: -1 });

                return {
                    ...user.toObject(),
                    lastMessage: lastMessage?.text || null,
                    lastMessageTime: lastMessage?.createdAt || null
                };
            })
        );

        const adminsWithLastMessage = await Promise.all(
            filteredAdmins.map(async (admin) => {
                const lastMessage = await Message.findOne({
                    $or: [
                        { senderId: loggedInUserId, receiverId: admin._id },
                        { senderId: admin._id, receiverId: loggedInUserId }
                    ]
                }).sort({ createdAt: -1 });

                return {
                    ...admin.toObject(),
                    lastMessage: lastMessage?.text || null,
                    lastMessageTime: lastMessage?.createdAt || null
                };
            })
        );

        res.status(200).json({
            filteredUsers: usersWithLastMessage,
            filteredAdmins: adminsWithLastMessage
        });
    } catch (error) {
        console.error("Error in getUsersForSidebar: ", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

/**
 * GET MESSAGES
 * Retrieves chat history between two specific users
 */
export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const { myId } = req.query;

        if (!myId) return res.status(400).json({ error: "myId is required" });

        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId }
            ]
        }).sort({ createdAt: 1 });

        res.status(200).json(messages);
    } catch (error) {
        console.error("Error in getMessages: ", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

/**
 * SEND MESSAGE
 * Handles new messages and stores them in database
 */
export const sendMessage = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.user?._id?.toString() || req.body.senderId;

        const { text = "", documents = [], replyTo, messageType = "text" } = req.body;

        if (!senderId || !receiverId) {
            return res.status(400).json({ error: "Sender and receiver IDs are required" });
        }

        // Create new message in database
        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            documents,
            readistrue: false,
            status: 'sent',
            messageType,
            replyTo
        });

        await newMessage.save();

        // Populate the message with user details for response
        const populatedMessage = await Message.findById(newMessage._id)
            .populate('senderId', 'name profile')
            .populate('receiverId', 'name profile');

        // Get sender and receiver info
        const sender = await (await Users.findById(senderId) || await Admin.findById(senderId));
        const receiver = await (await Users.findById(receiverId) || await Admin.findById(receiverId));

        const messageData = {
            ...populatedMessage.toObject(),
            _id: populatedMessage._id,
            id: populatedMessage._id,
            userName: sender?.name,
            userProfile: sender?.profile,
            receiverName: receiver?.name,
            timestamp: newMessage.createdAt
        };

        // Send to specific receiver
        const receiverSockets = getReceiverSocketId(receiverId) || [];
        receiverSockets.forEach(socketId => {
            io.to(socketId).emit("newMessage", messageData);
            io.to(socketId).emit("message_received", messageData);
        });

        // Send to all admins if receiver is admin
        if (receiver?.role === 'admin') {
            const allAdmins = await Admin.find().select('_id');
            allAdmins.forEach(admin => {
                if (admin._id.toString() !== receiverId) {
                    const adminSockets = getReceiverSocketId(admin._id.toString()) || [];
                    adminSockets.forEach(id => {
                        io.to(id).emit("newMessage", messageData);
                        io.to(id).emit("message_received", messageData);
                    });
                }
            });
        }

        // Send to sender (for multi-tab sync)
        const senderSockets = getReceiverSocketId(senderId) || [];
        senderSockets.forEach(id => {
            io.to(id).emit("newMessage", messageData);
            io.to(id).emit("message_sent", messageData);
        });

        // Update message status to delivered
        setTimeout(async () => {
            await Message.findByIdAndUpdate(newMessage._id, { status: 'delivered' });
            receiverSockets.forEach(id => {
                io.to(id).emit("message_status_update", {
                    messageId: newMessage._id,
                    status: 'delivered'
                });
            });
        }, 1000);

        res.status(201).json(messageData);
    } catch (error) {
        console.error("Error in sendMessage:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * MARK MESSAGES AS READ
 * Updates read status and notifies sender
 */
export const markMessagesAsRead = async (req, res) => {
    try {
        const { chatUserId } = req.params; // The sender of the messages
        const { readerId } = req.body;      // The current user viewing them

        if (!chatUserId || !readerId) {
            return res.status(400).json({ error: "chatUserId and readerId required" });
        }

        // Update all unread messages
        const result = await Message.updateMany(
            {
                senderId: chatUserId,
                receiverId: readerId,
                readistrue: false
            },
            {
                $set: {
                    readistrue: true,
                    status: 'read',
                    readAt: new Date()
                }
            }
        );

        if (result.modifiedCount > 0) {
            // Get the updated messages
            const updatedMessages = await Message.find({
                senderId: chatUserId,
                receiverId: readerId,
                readistrue: true
            });

            // Notify the original sender that their messages are read
            const senderSockets = getReceiverSocketId(chatUserId) || [];
            senderSockets.forEach(id => {
                io.to(id).emit("messagesRead", {
                    byUserId: readerId,
                    chatUserId,
                    messageIds: updatedMessages.map(m => m._id)
                });

                // Also send individual status updates
                updatedMessages.forEach(msg => {
                    io.to(id).emit("message_status_update", {
                        messageId: msg._id,
                        status: 'read'
                    });
                });
            });

            // Update receiver's own UI
            const readerSockets = getReceiverSocketId(readerId) || [];
            readerSockets.forEach(id => {
                io.to(id).emit("messagesRead", {
                    byUserId: readerId,
                    chatUserId,
                    messageIds: updatedMessages.map(m => m._id)
                });
            });
        }

        return res.status(200).json({
            success: true,
            updatedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("MARK READ ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * DELETE MESSAGE
 * Soft delete or hard delete message
 */
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { userId } = req.body;

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Check if user is sender
        if (message.senderId.toString() !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Soft delete - you could also implement hard delete
        message.text = "[Message deleted]";
        message.documents = [];
        message.isEdited = true;
        await message.save();

        // Notify both parties
        const sockets = [
            ...(getReceiverSocketId(message.senderId.toString()) || []),
            ...(getReceiverSocketId(message.receiverId.toString()) || [])
        ];

        sockets.forEach(id => {
            io.to(id).emit("message_deleted", {
                messageId: message._id,
                chatUserId: message.senderId === userId ? message.receiverId : message.senderId
            });
        });

        res.status(200).json({ success: true, message: "Message deleted" });
    } catch (error) {
        console.error("DELETE MESSAGE ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * EDIT MESSAGE
 * Edit an existing message
 */
export const editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { text, userId } = req.body;

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Check if user is sender
        if (message.senderId.toString() !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Check if message is too old to edit (optional)
        const messageAge = Date.now() - message.createdAt.getTime();
        if (messageAge > 15 * 60 * 1000) { // 15 minutes
            return res.status(400).json({ error: "Message too old to edit" });
        }

        message.text = text;
        message.isEdited = true;
        await message.save();

        // Notify both parties
        const sockets = [
            ...(getReceiverSocketId(message.senderId.toString()) || []),
            ...(getReceiverSocketId(message.receiverId.toString()) || [])
        ];

        sockets.forEach(id => {
            io.to(id).emit("message_edited", {
                messageId: message._id,
                newText: text,
                isEdited: true
            });
        });

        res.status(200).json({ success: true, message });
    } catch (error) {
        console.error("EDIT MESSAGE ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET UNREAD COUNT
 * Get count of unread messages for a user
 */
export const getUnreadCount = async (req, res) => {
    try {
        const { userId } = req.params;

        const count = await Message.countDocuments({
            receiverId: userId,
            readistrue: false
        });

        res.status(200).json({ unreadCount: count });
    } catch (error) {
        console.error("GET UNREAD COUNT ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * SEARCH MESSAGES
 * Search through message history
 */
export const searchMessages = async (req, res) => {
    try {
        const { userId, query } = req.query;

        if (!userId || !query) {
            return res.status(400).json({ error: "userId and query required" });
        }

        const messages = await Message.find({
            $and: [
                {
                    $or: [
                        { senderId: userId },
                        { receiverId: userId }
                    ]
                },
                {
                    $or: [
                        { text: { $regex: query, $options: 'i' } },
                        { documents: { $regex: query, $options: 'i' } }
                    ]
                }
            ]
        }).sort({ createdAt: -1 }).limit(50);

        res.status(200).json(messages);
    } catch (error) {
        console.error("SEARCH MESSAGES ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};