const Chat = require('../models/Chat');
const Project = require('../models/Project');

// @desc    Get chat history for a project
// @route   GET /api/chat/:projectId
// @access  Private
const getProjectChat = async (req, res, next) => {
    try {
        const project = await Project.findById(req.params.projectId);
        if (!project) {
            res.status(404);
            throw new Error('Project not found');
        }

        // Security check for Clients
        if (req.user.role === 'CLIENT' && project.clientId?.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('Not authorized to view this project chat');
        }

        const chats = await Chat.find({
            projectId: req.params.projectId,
            companyId: req.user.companyId
        }).populate('sender', 'fullName role');

        res.json(chats);
    } catch (error) {
        next(error);
    }
};

// @desc    Get private chat history between users
// @route   GET /api/chat/private/:userId
// @access  Private
const getPrivateChat = async (req, res, next) => {
    try {
        const otherUserId = req.params.userId;
        const chats = await Chat.find({
            companyId: req.user.companyId,
            $or: [
                { sender: req.user._id, receiverId: otherUserId },
                { sender: otherUserId, receiverId: req.user._id }
            ]
        }).populate('sender', 'fullName role');

        res.json(chats);
    } catch (error) {
        next(error);
    }
};

// @desc    Send message (Handled by Socket.io, but this is the REST fallback or persistence)
// @route   POST /api/chat
// @access  Private
const sendMessage = async (req, res, next) => {
    try {
        const { projectId, receiverId, message, attachments } = req.body;

        if (!projectId && !receiverId) {
            res.status(400);
            throw new Error('Project ID or Receiver ID is required');
        }

        let chatData = {
            companyId: req.user.companyId,
            sender: req.user._id,
            message,
            attachments
        };

        if (projectId) {
            const project = await Project.findById(projectId);
            if (!project) {
                res.status(404);
                throw new Error('Project not found');
            }
            if (req.user.role === 'CLIENT' && project.clientId?.toString() !== req.user._id.toString()) {
                res.status(403);
                throw new Error('Not authorized to send messages to this project chat');
            }
            chatData.projectId = projectId;
        } else {
            chatData.receiverId = receiverId;
        }

        const chat = await Chat.create(chatData);

        // Final chat object for emission
        const fullChat = await Chat.findById(chat._id).populate('sender', 'fullName role');

        // Emit via Socket.io if available
        const io = req.app.get('io');
        if (io) {
            if (projectId) {
                // Emit to project room
                io.to(projectId).emit('new_message', fullChat);
            } else {
                // Emit to receiver's personal room
                io.to(receiverId).emit('new_message', fullChat);
                // Also emit to sender (for multi-device sync)
                io.to(req.user._id.toString()).emit('new_message', fullChat);
            }
        }

        res.status(201).json(fullChat);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProjectChat,
    getPrivateChat,
    sendMessage
};
