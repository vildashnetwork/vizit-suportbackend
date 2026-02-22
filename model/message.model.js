import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
    {
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        text: {
            type: String,
            default: ''
        },
        documents: {
            type: [String],
            default: [] // Fixed typo: defualt -> default
        },
        readistrue: {
            type: Boolean,
            default: false // Added default
        },
        status: {
            type: String,
            enum: ['sent', 'delivered', 'read', 'failed'],
            default: 'sent'
        },
        messageType: {
            type: String,
            enum: ['text', 'image', 'video', 'document', 'system'],
            default: 'text'
        },
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SupportMessage'
        },
        isEdited: {
            type: Boolean,
            default: false
        },
        deliveredAt: Date,
        readAt: Date
    },
    { timestamps: true }
);

// Indexes for better query performance
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, readistrue: 1 });

const Message = mongoose.model('SupportMessage', messageSchema);

export default Message;