import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:8080", "http://localhost:8081"],
        credentials: true,
        methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"]
});

// Store online users and their socket IDs
const userSocketMap = new Map(); // userId -> Set of socketIds
const adminSockets = new Set(); // Store admin socket IDs

export const getReceiverSocketId = (receiverId) => {
    const sockets = userSocketMap.get(receiverId?.toString());
    return sockets ? Array.from(sockets) : [];
};

// Handle socket connections
io.on("connection", (socket) => {
    const userId = socket.handshake.auth.userId;
    const userRole = socket.handshake.auth.role;
    const userName = socket.handshake.auth.userName;

    console.log(`🔌 User connected: ${userName || userId} (${userRole || 'user'}) - Socket: ${socket.id}`);

    if (userId) {
        // Add socket to user's socket set
        if (!userSocketMap.has(userId)) {
            userSocketMap.set(userId, new Set());
        }
        userSocketMap.get(userId).add(socket.id);

        // Track admin sockets
        if (userRole === 'admin') {
            adminSockets.add(socket.id);
        }

        // Broadcast online users to all connected clients
        const onlineUsers = Array.from(userSocketMap.keys());
        io.emit("getOnlineUsers", onlineUsers);

        // Broadcast admin status
        io.emit("admin_status", { online: adminSockets.size > 0 });
    }

    // Handle typing indicator
    socket.on("typing", ({ chatUserId, isTyping }) => {
        const receiverSockets = getReceiverSocketId(chatUserId);
        receiverSockets.forEach(id => {
            io.to(id).emit("typingStatus", {
                byUserId: userId,
                isTyping,
                userName
            });
        });
    });

    // Handle message sending
    socket.on("send_message", async (messageData) => {
        try {
            const { receiverId, id: tempId, ...rest } = messageData;

            // Send to receiver
            const receiverSockets = getReceiverSocketId(receiverId);
            receiverSockets.forEach(id => {
                io.to(id).emit("newMessage", {
                    ...rest,
                    _id: tempId,
                    id: tempId,
                    senderId: userId,
                    receiverId,
                    timestamp: new Date(),
                    status: 'delivered'
                });
            });

            // Send to sender (for other tabs)
            const senderSockets = getReceiverSocketId(userId);
            senderSockets.forEach(id => {
                if (id !== socket.id) {
                    io.to(id).emit("newMessage", {
                        ...rest,
                        _id: tempId,
                        id: tempId,
                        senderId: userId,
                        receiverId,
                        timestamp: new Date(),
                        status: 'sent'
                    });
                }
            });

            // Send to all admins if receiver is admin
            const receiver = await (async () => {
                try {
                    const Admin = (await import("../model/addming.js")).default;
                    return await Admin.findById(receiverId);
                } catch {
                    return null;
                }
            })();

            if (receiver?.role === 'admin') {
                adminSockets.forEach(id => {
                    if (id !== socket.id && !receiverSockets.includes(id)) {
                        io.to(id).emit("newMessage", {
                            ...rest,
                            _id: tempId,
                            id: tempId,
                            senderId: userId,
                            receiverId,
                            timestamp: new Date(),
                            status: 'delivered'
                        });
                    }
                });
            }

        } catch (error) {
            console.error("Error in send_message:", error);
        }
    });

    // Handle marking messages as read
    socket.on("mark_as_read", async ({ messageIds, chatUserId }) => {
        const senderSockets = getReceiverSocketId(chatUserId);
        senderSockets.forEach(id => {
            io.to(id).emit("messagesRead", {
                byUserId: userId,
                chatUserId,
                messageIds
            });
        });

        // Also update receiver's UI
        const receiverSockets = getReceiverSocketId(userId);
        receiverSockets.forEach(id => {
            io.to(id).emit("messagesRead", {
                byUserId: userId,
                chatUserId,
                messageIds
            });
        });
    });

    // Handle admin online status
    socket.on("admin_online", ({ online }) => {
        if (online) {
            adminSockets.add(socket.id);
        } else {
            adminSockets.delete(socket.id);
        }
        io.emit("admin_status", { online: adminSockets.size > 0 });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log(`🔌 User disconnected: ${socket.id}`);

        if (userId) {
            const userSockets = userSocketMap.get(userId);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    userSocketMap.delete(userId);
                }
            }
        }

        // Remove from admin sockets
        adminSockets.delete(socket.id);

        // Update online users
        const onlineUsers = Array.from(userSocketMap.keys());
        io.emit("getOnlineUsers", onlineUsers);
        io.emit("admin_status", { online: adminSockets.size > 0 });
    });
});

export { app, io, server };