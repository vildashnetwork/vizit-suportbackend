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

/**
 * GET USERS FOR SIDEBAR - SIMPLIFIED WORKING VERSION
 * Fetches the list of contacts for the logged-in user or admin
 */
export const getUsersForSidebar = async (req, res) => {
    try {
        const { loggedInUserId } = req.params;

        console.log("Fetching users for sidebar. User ID:", loggedInUserId);

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(loggedInUserId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        // Find the user in either Admin or Users collection
        let me = await Admin.findById(loggedInUserId).select('-password').lean();
        if (!me) {
            me = await Users.findById(loggedInUserId).select('-password').lean();
        }

        if (!me) {
            console.log("User not found with ID:", loggedInUserId);
            return res.status(404).json({ message: "User not found" });
        }

        console.log("User found:", me.name || me.email);

        // Get all users and admins
        const [allUsers, allAdmins] = await Promise.all([
            Users.find().select('-password').lean(),
            Admin.find().select('-password').lean()
        ]);

        // Combine and filter out current user
        let allContacts = [...allUsers, ...allAdmins].filter(
            contact => contact._id.toString() !== loggedInUserId
        );

        console.log(`Found ${allContacts.length} potential contacts`);

        // Get last messages for each contact (simplified)
        const contactsWithMessages = [];

        for (const contact of allContacts) {
            // Find last message between current user and this contact
            const lastMessage = await Message.findOne({
                $or: [
                    { senderId: loggedInUserId, receiverId: contact._id.toString() },
                    { senderId: contact._id.toString(), receiverId: loggedInUserId }
                ]
            }).sort({ createdAt: -1 }).lean();

            // Count unread messages
            const unreadCount = await Message.countDocuments({
                senderId: contact._id.toString(),
                receiverId: loggedInUserId,
                readistrue: false
            });

            contactsWithMessages.push({
                ...contact,
                lastMessage: lastMessage?.text || null,
                lastMessageTime: lastMessage?.createdAt || null,
                lastMessageType: lastMessage?.messageType || null,
                unreadCount
            });
        }

        // Sort by last message time (most recent first)
        contactsWithMessages.sort((a, b) => {
            const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
            const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
            return timeB - timeA;
        });

        console.log(`Returning ${contactsWithMessages.length} contacts`);

        res.status(200).json({
            contacts: contactsWithMessages,
            totalContacts: contactsWithMessages.length
        });

    } catch (error) {
        console.error("Error in getUsersForSidebar: ", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};

/**
 * GET MESSAGES - SIMPLIFIED WORKING VERSION
 */
export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const { myId } = req.query;

        console.log("Getting messages between:", myId, "and", userToChatId);

        if (!myId) {
            return res.status(400).json({ error: "myId is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(myId) || !mongoose.Types.ObjectId.isValid(userToChatId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId }
            ]
        })
            .sort({ createdAt: 1 })
            .lean();

        console.log(`Found ${messages.length} messages`);

        // Get user details for sender and receiver
        const [sender, receiver] = await Promise.all([
            (await Users.findById(myId).select('name profile').lean()) ||
            (await Admin.findById(myId).select('name profile').lean()),
            (await Users.findById(userToChatId).select('name profile').lean()) ||
            (await Admin.findById(userToChatId).select('name profile').lean())
        ]);

        // Enhance messages with user details
        const enhancedMessages = messages.map(msg => ({
            ...msg,
            senderName: sender?.name,
            receiverName: receiver?.name
        }));

        res.status(200).json(enhancedMessages);

    } catch (error) {
        console.error("Error in getMessages: ", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * SEND MESSAGE - SIMPLIFIED WORKING VERSION
 */
export const sendMessage = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.user?._id?.toString() || req.body.senderId;

        const { text = "", documents = [], replyTo, messageType = "text" } = req.body;

        console.log("Sending message from", senderId, "to", receiverId);

        if (!senderId || !receiverId) {
            return res.status(400).json({ error: "Sender and receiver IDs are required" });
        }

        if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({ error: "Invalid user ID format" });
        }

        if (messageType === "text" && !text.trim()) {
            return res.status(400).json({ error: "Message text cannot be empty" });
        }

        // Create new message
        const newMessage = new Message({
            senderId,
            receiverId,
            text: text.trim(),
            documents: documents || [],
            readistrue: false,
            status: 'sent',
            messageType,
            replyTo: replyTo || null
        });

        await newMessage.save();

        console.log("Message saved with ID:", newMessage._id);

        // Get sender and receiver info
        let sender = await Users.findById(senderId).select('name profile').lean();
        if (!sender) sender = await Admin.findById(senderId).select('name profile').lean();

        let receiver = await Users.findById(receiverId).select('name profile').lean();
        if (!receiver) receiver = await Admin.findById(receiverId).select('name profile').lean();

        const messageData = {
            ...newMessage.toObject(),
            senderName: sender?.name,
            senderProfile: sender?.profile,
            receiverName: receiver?.name,
            receiverProfile: receiver?.profile,
            timestamp: newMessage.createdAt
        };

        // Send to receiver via socket
        const receiverSockets = getReceiverSocketId(receiverId) || [];
        receiverSockets.forEach(socketId => {
            io.to(socketId).emit("newMessage", messageData);
        });

        // Send to sender (for multi-tab sync)
        const senderSockets = getReceiverSocketId(senderId) || [];
        senderSockets.forEach(id => {
            io.to(id).emit("newMessage", messageData);
        });

        // Update status to delivered after 1 second
        setTimeout(async () => {
            try {
                await Message.findByIdAndUpdate(newMessage._id, { status: 'delivered' });
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
        res.status(500).json({ error: error.message });
    }
};

/**
 * MARK MESSAGES AS READ - SIMPLIFIED WORKING VERSION
 */
export const markMessagesAsRead = async (req, res) => {
    try {
        const { chatUserId } = req.params;
        const { readerId } = req.body;

        console.log("Marking messages as read:", { chatUserId, readerId });

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

        console.log(`Marked ${result.modifiedCount} messages as read`);

        if (result.modifiedCount > 0) {
            // Get the updated message IDs
            const updatedMessages = await Message.find({
                senderId: chatUserId,
                receiverId: readerId,
                readistrue: true
            }).select('_id').lean();

            const messageIds = updatedMessages.map(m => m._id);

            // Notify sender
            const senderSockets = getReceiverSocketId(chatUserId) || [];
            senderSockets.forEach(id => {
                io.to(id).emit("messagesRead", {
                    byUserId: readerId,
                    chatUserId,
                    messageIds
                });
            });

            // Notify reader
            const readerSockets = getReceiverSocketId(readerId) || [];
            readerSockets.forEach(id => {
                io.to(id).emit("messagesRead", {
                    byUserId: readerId,
                    chatUserId,
                    messageIds
                });
            });
        }

        res.status(200).json({
            success: true,
            updatedCount: result.modifiedCount
        });

    } catch (error) {
        console.error("MARK READ ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * DELETE MESSAGE - SIMPLIFIED WORKING VERSION
 */
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { userId } = req.body;

        console.log("Deleting message:", messageId);

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Check if user is sender
        if (message.senderId.toString() !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Soft delete
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

        res.status(200).json({ success: true });

    } catch (error) {
        console.error("DELETE MESSAGE ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * EDIT MESSAGE - SIMPLIFIED WORKING VERSION
 */
export const editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { text, userId } = req.body;

        console.log("Editing message:", messageId);

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Check if user is sender
        if (message.senderId.toString() !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // 15 minute edit limit
        const messageAge = Date.now() - message.createdAt.getTime();
        if (messageAge > 15 * 60 * 1000) {
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
 * GET UNREAD COUNT - SIMPLIFIED WORKING VERSION
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
 * SEARCH MESSAGES - SIMPLIFIED WORKING VERSION
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
                    text: { $regex: query, $options: 'i' }
                }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        res.status(200).json(messages);

    } catch (error) {
        console.error("SEARCH MESSAGES ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};