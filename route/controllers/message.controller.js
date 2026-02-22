// import { getReceiverSocketId, io } from "../../socket.js";
// import Message from "../../model/message.model.js";
// import Admin from "../../model/addming.js";
// import Users from "../../model/usersforsuport.js";

// /**
//  * GET USERS FOR SIDEBAR
//  * Fetches the list of contacts for the logged-in user or admin
//  */
// export const getUsersForSidebar = async (req, res) => {
//     try {
//         const { loggedInUserId } = req.params;

//         // Find the record in either Admin or Users collection
//         const me = await Admin.findById(loggedInUserId) || await Users.findById(loggedInUserId);

//         if (!me) {
//             return res.status(404).json({ message: "User not found" });
//         }

//         // Fetch profiles of people in the chat history
//         const filteredUsers = await Users.find().select('-password');
//         const filteredAdmins = await Admin.find().select('-password');

//         // Get last message for each user
//         const usersWithLastMessage = await Promise.all(
//             filteredUsers.map(async (user) => {
//                 const lastMessage = await Message.findOne({
//                     $or: [
//                         { senderId: loggedInUserId, receiverId: user._id },
//                         { senderId: user._id, receiverId: loggedInUserId }
//                     ]
//                 }).sort({ createdAt: -1 });

//                 return {
//                     ...user.toObject(),
//                     lastMessage: lastMessage?.text || null,
//                     lastMessageTime: lastMessage?.createdAt || null
//                 };
//             })
//         );

//         const adminsWithLastMessage = await Promise.all(
//             filteredAdmins.map(async (admin) => {
//                 const lastMessage = await Message.findOne({
//                     $or: [
//                         { senderId: loggedInUserId, receiverId: admin._id },
//                         { senderId: admin._id, receiverId: loggedInUserId }
//                     ]
//                 }).sort({ createdAt: -1 });

//                 return {
//                     ...admin.toObject(),
//                     lastMessage: lastMessage?.text || null,
//                     lastMessageTime: lastMessage?.createdAt || null
//                 };
//             })
//         );

//         res.status(200).json({
//             filteredUsers: usersWithLastMessage,
//             filteredAdmins: adminsWithLastMessage
//         });
//     } catch (error) {
//         console.error("Error in getUsersForSidebar: ", error.message);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// };

// /**
//  * GET MESSAGES
//  * Retrieves chat history between two specific users
//  */
// export const getMessages = async (req, res) => {
//     try {
//         const { id: userToChatId } = req.params;
//         const { myId } = req.query;

//         if (!myId) return res.status(400).json({ error: "myId is required" });

//         const messages = await Message.find({
//             $or: [
//                 { senderId: myId, receiverId: userToChatId },
//                 { senderId: userToChatId, receiverId: myId }
//             ]
//         }).sort({ createdAt: 1 });

//         res.status(200).json(messages);
//     } catch (error) {
//         console.error("Error in getMessages: ", error.message);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// };

// /**
//  * SEND MESSAGE
//  * Handles new messages and stores them in database
//  */
// export const sendMessage = async (req, res) => {
//     try {
//         const { id: receiverId } = req.params;
//         const senderId = req.user?._id?.toString() || req.body.senderId;

//         const { text = "", documents = [], replyTo, messageType = "text" } = req.body;

//         if (!senderId || !receiverId) {
//             return res.status(400).json({ error: "Sender and receiver IDs are required" });
//         }

//         // Create new message in database
//         const newMessage = new Message({
//             senderId,
//             receiverId,
//             text,
//             documents,
//             readistrue: false,
//             status: 'sent',
//             messageType,
//             replyTo
//         });

//         await newMessage.save();

//         // Populate the message with user details for response
//         const populatedMessage = await Message.findById(newMessage._id)
//             .populate('senderId', 'name profile')
//             .populate('receiverId', 'name profile');

//         // Get sender and receiver info
//         const sender = await (await Users.findById(senderId) || await Admin.findById(senderId));
//         const receiver = await (await Users.findById(receiverId) || await Admin.findById(receiverId));

//         const messageData = {
//             ...populatedMessage.toObject(),
//             _id: populatedMessage._id,
//             id: populatedMessage._id,
//             userName: sender?.name,
//             userProfile: sender?.profile,
//             receiverName: receiver?.name,
//             timestamp: newMessage.createdAt
//         };

//         // Send to specific receiver
//         const receiverSockets = getReceiverSocketId(receiverId) || [];
//         receiverSockets.forEach(socketId => {
//             io.to(socketId).emit("newMessage", messageData);
//             io.to(socketId).emit("message_received", messageData);
//         });

//         // Send to all admins if receiver is admin
//         if (receiver?.role === 'admin') {
//             const allAdmins = await Admin.find().select('_id');
//             allAdmins.forEach(admin => {
//                 if (admin._id.toString() !== receiverId) {
//                     const adminSockets = getReceiverSocketId(admin._id.toString()) || [];
//                     adminSockets.forEach(id => {
//                         io.to(id).emit("newMessage", messageData);
//                         io.to(id).emit("message_received", messageData);
//                     });
//                 }
//             });
//         }

//         // Send to sender (for multi-tab sync)
//         const senderSockets = getReceiverSocketId(senderId) || [];
//         senderSockets.forEach(id => {
//             io.to(id).emit("newMessage", messageData);
//             io.to(id).emit("message_sent", messageData);
//         });

//         // Update message status to delivered
//         setTimeout(async () => {
//             await Message.findByIdAndUpdate(newMessage._id, { status: 'delivered' });
//             receiverSockets.forEach(id => {
//                 io.to(id).emit("message_status_update", {
//                     messageId: newMessage._id,
//                     status: 'delivered'
//                 });
//             });
//         }, 1000);

//         res.status(201).json(messageData);
//     } catch (error) {
//         console.error("Error in sendMessage:", error);
//         res.status(500).json({ error: error.message });
//     }
// };

// /**
//  * MARK MESSAGES AS READ
//  * Updates read status and notifies sender
//  */
// export const markMessagesAsRead = async (req, res) => {
//     try {
//         const { chatUserId } = req.params; // The sender of the messages
//         const { readerId } = req.body;      // The current user viewing them

//         if (!chatUserId || !readerId) {
//             return res.status(400).json({ error: "chatUserId and readerId required" });
//         }

//         // Update all unread messages
//         const result = await Message.updateMany(
//             {
//                 senderId: chatUserId,
//                 receiverId: readerId,
//                 readistrue: false
//             },
//             {
//                 $set: {
//                     readistrue: true,
//                     status: 'read',
//                     readAt: new Date()
//                 }
//             }
//         );

//         if (result.modifiedCount > 0) {
//             // Get the updated messages
//             const updatedMessages = await Message.find({
//                 senderId: chatUserId,
//                 receiverId: readerId,
//                 readistrue: true
//             });

//             // Notify the original sender that their messages are read
//             const senderSockets = getReceiverSocketId(chatUserId) || [];
//             senderSockets.forEach(id => {
//                 io.to(id).emit("messagesRead", {
//                     byUserId: readerId,
//                     chatUserId,
//                     messageIds: updatedMessages.map(m => m._id)
//                 });

//                 // Also send individual status updates
//                 updatedMessages.forEach(msg => {
//                     io.to(id).emit("message_status_update", {
//                         messageId: msg._id,
//                         status: 'read'
//                     });
//                 });
//             });

//             // Update receiver's own UI
//             const readerSockets = getReceiverSocketId(readerId) || [];
//             readerSockets.forEach(id => {
//                 io.to(id).emit("messagesRead", {
//                     byUserId: readerId,
//                     chatUserId,
//                     messageIds: updatedMessages.map(m => m._id)
//                 });
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             updatedCount: result.modifiedCount
//         });
//     } catch (error) {
//         console.error("MARK READ ERROR:", error);
//         res.status(500).json({ error: error.message });
//     }
// };

// /**
//  * DELETE MESSAGE
//  * Soft delete or hard delete message
//  */
// export const deleteMessage = async (req, res) => {
//     try {
//         const { messageId } = req.params;
//         const { userId } = req.body;

//         const message = await Message.findById(messageId);

//         if (!message) {
//             return res.status(404).json({ error: "Message not found" });
//         }

//         // Check if user is sender
//         if (message.senderId.toString() !== userId) {
//             return res.status(403).json({ error: "Unauthorized" });
//         }

//         // Soft delete - you could also implement hard delete
//         message.text = "[Message deleted]";
//         message.documents = [];
//         message.isEdited = true;
//         await message.save();

//         // Notify both parties
//         const sockets = [
//             ...(getReceiverSocketId(message.senderId.toString()) || []),
//             ...(getReceiverSocketId(message.receiverId.toString()) || [])
//         ];

//         sockets.forEach(id => {
//             io.to(id).emit("message_deleted", {
//                 messageId: message._id,
//                 chatUserId: message.senderId === userId ? message.receiverId : message.senderId
//             });
//         });

//         res.status(200).json({ success: true, message: "Message deleted" });
//     } catch (error) {
//         console.error("DELETE MESSAGE ERROR:", error);
//         res.status(500).json({ error: error.message });
//     }
// };

// /**
//  * EDIT MESSAGE
//  * Edit an existing message
//  */
// export const editMessage = async (req, res) => {
//     try {
//         const { messageId } = req.params;
//         const { text, userId } = req.body;

//         const message = await Message.findById(messageId);

//         if (!message) {
//             return res.status(404).json({ error: "Message not found" });
//         }

//         // Check if user is sender
//         if (message.senderId.toString() !== userId) {
//             return res.status(403).json({ error: "Unauthorized" });
//         }

//         // Check if message is too old to edit (optional)
//         const messageAge = Date.now() - message.createdAt.getTime();
//         if (messageAge > 15 * 60 * 1000) { // 15 minutes
//             return res.status(400).json({ error: "Message too old to edit" });
//         }

//         message.text = text;
//         message.isEdited = true;
//         await message.save();

//         // Notify both parties
//         const sockets = [
//             ...(getReceiverSocketId(message.senderId.toString()) || []),
//             ...(getReceiverSocketId(message.receiverId.toString()) || [])
//         ];

//         sockets.forEach(id => {
//             io.to(id).emit("message_edited", {
//                 messageId: message._id,
//                 newText: text,
//                 isEdited: true
//             });
//         });

//         res.status(200).json({ success: true, message });
//     } catch (error) {
//         console.error("EDIT MESSAGE ERROR:", error);
//         res.status(500).json({ error: error.message });
//     }
// };

// /**
//  * GET UNREAD COUNT
//  * Get count of unread messages for a user
//  */
// export const getUnreadCount = async (req, res) => {
//     try {
//         const { userId } = req.params;

//         const count = await Message.countDocuments({
//             receiverId: userId,
//             readistrue: false
//         });

//         res.status(200).json({ unreadCount: count });
//     } catch (error) {
//         console.error("GET UNREAD COUNT ERROR:", error);
//         res.status(500).json({ error: error.message });
//     }
// };

// /**
//  * SEARCH MESSAGES
//  * Search through message history
//  */
// export const searchMessages = async (req, res) => {
//     try {
//         const { userId, query } = req.query;

//         if (!userId || !query) {
//             return res.status(400).json({ error: "userId and query required" });
//         }

//         const messages = await Message.find({
//             $and: [
//                 {
//                     $or: [
//                         { senderId: userId },
//                         { receiverId: userId }
//                     ]
//                 },
//                 {
//                     $or: [
//                         { text: { $regex: query, $options: 'i' } },
//                         { documents: { $regex: query, $options: 'i' } }
//                     ]
//                 }
//             ]
//         }).sort({ createdAt: -1 }).limit(50);

//         res.status(200).json(messages);
//     } catch (error) {
//         console.error("SEARCH MESSAGES ERROR:", error);
//         res.status(500).json({ error: error.message });
//     }
// };




























import { getReceiverSocketId, io } from "../../socket.js";
import Message from "../../model/message.model.js";
import Admin from "../../model/addming.js";
import Users from "../../model/usersforsuport.js";
import mongoose from "mongoose";

// ==================== CONSTANTS ====================
const MESSAGE_EDIT_TIME_LIMIT = 15 * 60 * 1000; // 15 minutes
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SEARCH_RESULT_LIMIT = 50;

// ==================== UTILITY FUNCTIONS ====================

/**
 * Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Get user from either Admin or Users collection
 */
const getUserById = async (userId) => {
    if (!isValidObjectId(userId)) return null;

    let user = await Admin.findById(userId).select('-password').lean();
    if (!user) {
        user = await Users.findById(userId).select('-password').lean();
    }
    return user;
};

/**
 * Get multiple users by IDs
 */
const getUsersByIds = async (userIds) => {
    const validIds = userIds.filter(id => isValidObjectId(id));

    const [admins, users] = await Promise.all([
        Admin.find({ _id: { $in: validIds } }).select('-password').lean(),
        Users.find({ _id: { $in: validIds } }).select('-password').lean()
    ]);

    return [...admins, ...users];
};

// ==================== MAIN CONTROLLERS ====================

/**
 * GET USERS FOR SIDEBAR
 * Fetches the list of contacts for the logged-in user or admin with pagination
 */
export const getUsersForSidebar = async (req, res) => {
    try {
        const { loggedInUserId } = req.params;
        const { page = 1, limit = DEFAULT_PAGE_SIZE } = req.query;

        if (!isValidObjectId(loggedInUserId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        // Find the user in either collection
        const me = await getUserById(loggedInUserId);
        if (!me) {
            return res.status(404).json({ message: "User not found" });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const pageLimit = Math.min(parseInt(limit), MAX_PAGE_SIZE);

        // Get distinct chat partners using aggregation for better performance
        const chatPartners = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: loggedInUserId },
                        { receiverId: loggedInUserId }
                    ]
                }
            },
            {
                $group: {
                    _id: null,
                    partnerIds: {
                        $addToSet: {
                            $cond: [
                                { $eq: ["$senderId", loggedInUserId] },
                                "$receiverId",
                                "$senderId"
                            ]
                        }
                    }
                }
            }
        ]);

        const partnerIds = chatPartners[0]?.partnerIds || [];

        // Get all users and admins who have chatted with current user
        const [users, admins] = await Promise.all([
            Users.find({
                _id: { $in: partnerIds },
                _id: { $ne: loggedInUserId }
            }).select('-password').lean(),
            Admin.find({
                _id: { $in: partnerIds },
                _id: { $ne: loggedInUserId }
            }).select('-password').lean()
        ]);

        // Combine and sort by last message time
        let allContacts = [...users, ...admins];

        // Get last messages for all contacts efficiently using $in
        const contactIds = allContacts.map(c => c._id.toString());

        const lastMessages = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: loggedInUserId, receiverId: { $in: contactIds } },
                        { senderId: { $in: contactIds }, receiverId: loggedInUserId }
                    ]
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$senderId", loggedInUserId] },
                            "$receiverId",
                            "$senderId"
                        ]
                    },
                    lastMessage: { $first: "$$ROOT" }
                }
            }
        ]);

        // Create a map for quick lookup
        const lastMessageMap = {};
        lastMessages.forEach(item => {
            lastMessageMap[item._id.toString()] = item.lastMessage;
        });

        // Attach last messages to contacts
        const contactsWithMessages = allContacts.map(contact => {
            const lastMsg = lastMessageMap[contact._id.toString()];
            return {
                ...contact,
                lastMessage: lastMsg?.text || null,
                lastMessageTime: lastMsg?.createdAt || null,
                lastMessageType: lastMsg?.messageType || null,
                unreadCount: 0 // Will be calculated separately
            };
        });

        // Get unread counts for all contacts
        const unreadCounts = await Message.aggregate([
            {
                $match: {
                    receiverId: loggedInUserId,
                    senderId: { $in: contactIds },
                    readistrue: false
                }
            },
            {
                $group: {
                    _id: "$senderId",
                    count: { $sum: 1 }
                }
            }
        ]);

        const unreadMap = {};
        unreadCounts.forEach(item => {
            unreadMap[item._id.toString()] = item.count;
        });

        // Add unread counts
        contactsWithMessages.forEach(contact => {
            contact.unreadCount = unreadMap[contact._id.toString()] || 0;
        });

        // Sort by last message time (most recent first)
        contactsWithMessages.sort((a, b) => {
            const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
            const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
            return timeB - timeA;
        });

        // Apply pagination
        const paginatedContacts = contactsWithMessages.slice(skip, skip + pageLimit);
        const totalContacts = contactsWithMessages.length;

        res.status(200).json({
            contacts: paginatedContacts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalContacts / pageLimit),
                totalContacts,
                hasNextPage: skip + pageLimit < totalContacts,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.error("Error in getUsersForSidebar: ", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

/**
 * GET MESSAGES
 * Retrieves chat history between two specific users with pagination
 */
export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const { myId, page = 1, limit = 50 } = req.query;

        if (!myId) {
            return res.status(400).json({ error: "myId is required" });
        }

        if (!isValidObjectId(myId) || !isValidObjectId(userToChatId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const pageLimit = Math.min(parseInt(limit), 100);

        // Get total count for pagination
        const totalMessages = await Message.countDocuments({
            $or: [
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId }
            ]
        });

        // Get paginated messages
        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId }
            ]
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageLimit)
            .lean();

        // Get user details for sender and receiver
        const userIds = [...new Set(messages.flatMap(m => [m.senderId, m.receiverId]))];
        const users = await getUsersByIds(userIds);

        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = user;
        });

        // Enhance messages with user details
        const enhancedMessages = messages.map(msg => ({
            ...msg,
            senderName: userMap[msg.senderId.toString()]?.name,
            senderProfile: userMap[msg.senderId.toString()]?.profile,
            receiverName: userMap[msg.receiverId.toString()]?.name,
            receiverProfile: userMap[msg.receiverId.toString()]?.profile
        }));

        res.status(200).json({
            messages: enhancedMessages.reverse(), // Return in chronological order
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalMessages / pageLimit),
                totalMessages,
                hasNextPage: skip + pageLimit < totalMessages,
                hasPrevPage: page > 1
            }
        });

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

        if (!isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        // Validate message content based on type
        if (messageType === "text" && !text.trim()) {
            return res.status(400).json({ error: "Message text cannot be empty" });
        }

        if (messageType === "document" && (!documents || documents.length === 0)) {
            return res.status(400).json({ error: "Documents are required for document messages" });
        }

        // Create new message in database
        const newMessage = new Message({
            senderId,
            receiverId,
            text: text.trim(),
            documents,
            readistrue: false,
            status: 'sent',
            messageType,
            replyTo: replyTo && isValidObjectId(replyTo) ? replyTo : null
        });

        await newMessage.save();

        // Get sender and receiver info
        const [sender, receiver] = await Promise.all([
            getUserById(senderId),
            getUserById(receiverId)
        ]);

        const messageData = {
            ...newMessage.toObject(),
            _id: newMessage._id,
            id: newMessage._id,
            senderName: sender?.name,
            senderProfile: sender?.profile,
            receiverName: receiver?.name,
            receiverProfile: receiver?.profile,
            timestamp: newMessage.createdAt
        };

        // Send to specific receiver
        const receiverSockets = getReceiverSocketId(receiverId) || [];
        receiverSockets.forEach(socketId => {
            io.to(socketId).emit("newMessage", messageData);
        });

        // Send to all admins if receiver is admin
        if (receiver?.role === 'admin') {
            const allAdmins = await Admin.find().select('_id').lean();
            allAdmins.forEach(admin => {
                if (admin._id.toString() !== receiverId) {
                    const adminSockets = getReceiverSocketId(admin._id.toString()) || [];
                    adminSockets.forEach(id => {
                        io.to(id).emit("newMessage", messageData);
                    });
                }
            });
        }

        // Send to sender (for multi-tab sync)
        const senderSockets = getReceiverSocketId(senderId) || [];
        senderSockets.forEach(id => {
            io.to(id).emit("newMessage", messageData);
        });

        // Update message status to delivered after short delay
        setTimeout(async () => {
            try {
                await Message.findByIdAndUpdate(newMessage._id, {
                    status: 'delivered',
                    deliveredAt: new Date()
                });

                receiverSockets.forEach(id => {
                    io.to(id).emit("message_status_update", {
                        messageId: newMessage._id,
                        status: 'delivered'
                    });
                });
            } catch (err) {
                console.error("Error updating message status:", err);
            }
        }, 1000);

        res.status(201).json(messageData);

    } catch (error) {
        console.error("Error in sendMessage:", error);
        res.status(500).json({ error: "Failed to send message" });
    }
};

/**
 * MARK MESSAGES AS READ
 * Updates read status and notifies sender
 */
export const markMessagesAsRead = async (req, res) => {
    try {
        const { chatUserId } = req.params;
        const { readerId } = req.body;

        if (!chatUserId || !readerId) {
            return res.status(400).json({ error: "chatUserId and readerId required" });
        }

        if (!isValidObjectId(chatUserId) || !isValidObjectId(readerId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
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
            }).select('_id').lean();

            const messageIds = updatedMessages.map(m => m._id);

            // Notify the original sender that their messages are read
            const senderSockets = getReceiverSocketId(chatUserId) || [];
            senderSockets.forEach(id => {
                io.to(id).emit("messagesRead", {
                    byUserId: readerId,
                    chatUserId,
                    messageIds
                });

                // Send individual status updates
                messageIds.forEach(msgId => {
                    io.to(id).emit("message_status_update", {
                        messageId: msgId,
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
                    messageIds
                });
            });
        }

        return res.status(200).json({
            success: true,
            updatedCount: result.modifiedCount
        });

    } catch (error) {
        console.error("MARK READ ERROR:", error);
        res.status(500).json({ error: "Failed to mark messages as read" });
    }
};

/**
 * DELETE MESSAGE
 * Soft delete message
 */
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { userId } = req.body;

        if (!isValidObjectId(messageId) || !isValidObjectId(userId)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Check if user is sender
        if (message.senderId.toString() !== userId) {
            return res.status(403).json({ error: "Unauthorized to delete this message" });
        }

        // Check if message is too old to delete (optional - 24 hours)
        const messageAge = Date.now() - message.createdAt.getTime();
        if (messageAge > 24 * 60 * 60 * 1000) {
            return res.status(400).json({ error: "Message too old to delete" });
        }

        // Soft delete
        message.text = "[Message deleted]";
        message.documents = [];
        message.isDeleted = true;
        message.isEdited = true;
        await message.save();

        // Notify both parties
        const sockets = [
            ...(getReceiverSocketId(message.senderId.toString()) || []),
            ...(getReceiverSocketId(message.receiverId.toString()) || [])
        ];

        const uniqueSockets = [...new Set(sockets)];

        uniqueSockets.forEach(id => {
            io.to(id).emit("message_deleted", {
                messageId: message._id,
                chatUserId: message.senderId === userId ? message.receiverId : message.senderId,
                deletedAt: new Date()
            });
        });

        res.status(200).json({
            success: true,
            message: "Message deleted successfully",
            messageId: message._id
        });

    } catch (error) {
        console.error("DELETE MESSAGE ERROR:", error);
        res.status(500).json({ error: "Failed to delete message" });
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

        if (!text || !text.trim()) {
            return res.status(400).json({ error: "Message text cannot be empty" });
        }

        if (!isValidObjectId(messageId) || !isValidObjectId(userId)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Check if user is sender
        if (message.senderId.toString() !== userId) {
            return res.status(403).json({ error: "Unauthorized to edit this message" });
        }

        // Check if message is too old to edit
        const messageAge = Date.now() - message.createdAt.getTime();
        if (messageAge > MESSAGE_EDIT_TIME_LIMIT) {
            return res.status(400).json({ error: "Message too old to edit (max 15 minutes)" });
        }

        // Check if message is deleted
        if (message.isDeleted) {
            return res.status(400).json({ error: "Cannot edit deleted message" });
        }

        const originalText = message.text;
        message.text = text.trim();
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        // Get updated message with populated fields
        const updatedMessage = await Message.findById(messageId).lean();

        // Notify both parties
        const sockets = [
            ...(getReceiverSocketId(message.senderId.toString()) || []),
            ...(getReceiverSocketId(message.receiverId.toString()) || [])
        ];

        const uniqueSockets = [...new Set(sockets)];

        uniqueSockets.forEach(id => {
            io.to(id).emit("message_edited", {
                messageId: message._id,
                newText: text.trim(),
                originalText,
                isEdited: true,
                editedAt: message.editedAt
            });
        });

        res.status(200).json({
            success: true,
            message: updatedMessage
        });

    } catch (error) {
        console.error("EDIT MESSAGE ERROR:", error);
        res.status(500).json({ error: "Failed to edit message" });
    }
};

/**
 * GET UNREAD COUNT
 * Get count of unread messages for a user
 */
export const getUnreadCount = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!isValidObjectId(userId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        const [totalUnread, unreadBySender] = await Promise.all([
            Message.countDocuments({
                receiverId: userId,
                readistrue: false
            }),
            Message.aggregate([
                {
                    $match: {
                        receiverId: userId,
                        readistrue: false
                    }
                },
                {
                    $group: {
                        _id: "$senderId",
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        const unreadBySenderMap = {};
        unreadBySender.forEach(item => {
            unreadBySenderMap[item._id.toString()] = item.count;
        });

        res.status(200).json({
            unreadCount: totalUnread,
            unreadBySender: unreadBySenderMap
        });

    } catch (error) {
        console.error("GET UNREAD COUNT ERROR:", error);
        res.status(500).json({ error: "Failed to get unread count" });
    }
};

/**
 * SEARCH MESSAGES
 * Search through message history
 */
export const searchMessages = async (req, res) => {
    try {
        const { userId, query, page = 1, limit = SEARCH_RESULT_LIMIT } = req.query;

        if (!userId || !query) {
            return res.status(400).json({ error: "userId and query required" });
        }

        if (!isValidObjectId(userId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        if (query.length < 2) {
            return res.status(400).json({ error: "Search query must be at least 2 characters" });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        // Get total count
        const totalResults = await Message.countDocuments({
            $and: [
                {
                    $or: [
                        { senderId: userId },
                        { receiverId: userId }
                    ]
                },
                {
                    $or: [
                        { text: searchRegex },
                        { documents: searchRegex }
                    ]
                },
                { isDeleted: { $ne: true } }
            ]
        });

        // Get paginated results
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
                        { text: searchRegex },
                        { documents: searchRegex }
                    ]
                },
                { isDeleted: { $ne: true } }
            ]
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get user details for all participants
        const userIds = [...new Set(messages.flatMap(m => [m.senderId, m.receiverId]))];
        const users = await getUsersByIds(userIds);

        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = user;
        });

        // Enhance messages with user details
        const enhancedMessages = messages.map(msg => ({
            ...msg,
            senderName: userMap[msg.senderId.toString()]?.name,
            senderProfile: userMap[msg.senderId.toString()]?.profile,
            receiverName: userMap[msg.receiverId.toString()]?.name,
            receiverProfile: userMap[msg.receiverId.toString()]?.profile
        }));

        res.status(200).json({
            messages: enhancedMessages,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalResults / parseInt(limit)),
                totalResults,
                hasNextPage: skip + parseInt(limit) < totalResults,
                hasPrevPage: page > 1
            },
            query
        });

    } catch (error) {
        console.error("SEARCH MESSAGES ERROR:", error);
        res.status(500).json({ error: "Failed to search messages" });
    }
};

/**
 * GET MESSAGE BY ID
 * Get a single message by ID
 */
export const getMessageById = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { userId } = req.query;

        if (!isValidObjectId(messageId) || (userId && !isValidObjectId(userId))) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const message = await Message.findById(messageId).lean();

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // If userId provided, check if user has access to this message
        if (userId) {
            if (message.senderId.toString() !== userId && message.receiverId.toString() !== userId) {
                return res.status(403).json({ error: "Unauthorized to view this message" });
            }
        }

        // Get user details
        const [sender, receiver] = await Promise.all([
            getUserById(message.senderId),
            getUserById(message.receiverId)
        ]);

        const enhancedMessage = {
            ...message,
            senderName: sender?.name,
            senderProfile: sender?.profile,
            receiverName: receiver?.name,
            receiverProfile: receiver?.profile
        };

        res.status(200).json(enhancedMessage);

    } catch (error) {
        console.error("GET MESSAGE BY ID ERROR:", error);
        res.status(500).json({ error: "Failed to get message" });
    }
};

/**
 * DELETE CHAT HISTORY
 * Delete entire chat history between two users
 */
export const deleteChatHistory = async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        const { requesterId } = req.body;

        if (!isValidObjectId(userId1) || !isValidObjectId(userId2) || !isValidObjectId(requesterId)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        // Check if requester is one of the participants
        if (requesterId !== userId1 && requesterId !== userId2) {
            return res.status(403).json({ error: "Unauthorized to delete this chat" });
        }

        // Soft delete all messages between these users
        const result = await Message.updateMany(
            {
                $or: [
                    { senderId: userId1, receiverId: userId2 },
                    { senderId: userId2, receiverId: userId1 }
                ],
                isDeleted: { $ne: true }
            },
            {
                $set: {
                    text: "[Message deleted]",
                    documents: [],
                    isDeleted: true,
                    isEdited: true,
                    deletedAt: new Date()
                }
            }
        );

        // Notify both users
        const sockets = [
            ...(getReceiverSocketId(userId1) || []),
            ...(getReceiverSocketId(userId2) || [])
        ];

        const uniqueSockets = [...new Set(sockets)];

        uniqueSockets.forEach(id => {
            io.to(id).emit("chat_deleted", {
                chatPartnerId: id === userId1 ? userId2 : userId1,
                deletedAt: new Date()
            });
        });

        res.status(200).json({
            success: true,
            message: "Chat history deleted successfully",
            deletedCount: result.modifiedCount
        });

    } catch (error) {
        console.error("DELETE CHAT HISTORY ERROR:", error);
        res.status(500).json({ error: "Failed to delete chat history" });
    }
};