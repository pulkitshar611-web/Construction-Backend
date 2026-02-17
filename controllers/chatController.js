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

// @desc    Send message (Handled by Socket.io, but this is the REST fallback or persistence)
// @route   POST /api/chat
// @access  Private
const sendMessage = async (req, res, next) => {
    try {
        const { projectId, message, attachments } = req.body;

        const project = await Project.findById(projectId);
        if (!project) {
            res.status(404);
            throw new Error('Project not found');
        }

        // Security check for Clients
        if (req.user.role === 'CLIENT' && project.clientId?.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('Not authorized to send messages to this project chat');
        }

        const chat = await Chat.create({
            companyId: req.user.companyId,
            projectId,
            sender: req.user._id,
            message,
            attachments
        });

        // Emit via Socket.io if available
        const io = req.app.get('io');
        if (io) {
            io.to(projectId).emit('new_message', chat);
        }

        res.status(201).json(chat);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProjectChat,
    sendMessage
};
