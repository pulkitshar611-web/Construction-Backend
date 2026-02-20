const Chat = require('../models/Chat');
const Project = require('../models/Project');
const User = require('../models/User');

// @desc    Get chat rooms/users based on permissions
// @route   GET /api/chat/rooms
// @access  Private
const getChatRooms = async (req, res, next) => {
    try {
        const { role, _id, companyId } = req.user;
        const rooms = [];

        // 1. General Company Chat
        if (role !== 'SUBCONTRACTOR') {
            rooms.push({
                id: 'GENERAL_COMPANY',
                name: 'General Company Chat',
                isGroup: true,
                type: 'company',
                role: 'Global'
            });
        }

        // 2. Project Chats
        let projectQuery = { companyId };
        if (role === 'PM') {
            projectQuery.$or = [{ pmId: _id }, { createdBy: _id }];
        } else if (['FOREMAN', 'WORKER', 'SUBCONTRACTOR'].includes(role)) {
            const Job = require('../models/Job');
            const jobs = await Job.find({
                $or: [{ foremanId: _id }, { assignedWorkers: _id }]
            }).select('projectId');
            projectQuery._id = { $in: jobs.map(j => j.projectId).filter(id => id) };
        }
        // COMPANY_OWNER and SUPER_ADMIN see all active projects

        const projects = await Project.find(projectQuery);
        projects.forEach(p => {
            rooms.push({
                id: p._id,
                name: p.name,
                isGroup: true,
                type: 'project',
                role: 'Project'
            });
        });

        // 3. Direct Messages (Filtering based on roles)
        const allUsers = await User.find({ companyId, _id: { $ne: _id } }).select('fullName role avatar');

        const filteredUsers = allUsers.filter(targetUser => {
            if (role === 'SUPER_ADMIN' || role === 'COMPANY_OWNER') {
                return ['COMPANY_OWNER', 'PM', 'FOREMAN', 'WORKER'].includes(targetUser.role);
            }
            if (role === 'PM') {
                return ['COMPANY_OWNER', 'PM', 'FOREMAN', 'WORKER'].includes(targetUser.role);
            }
            if (role === 'FOREMAN') {
                return ['COMPANY_OWNER', 'PM', 'FOREMAN', 'WORKER'].includes(targetUser.role);
            }
            if (role === 'WORKER') {
                return ['COMPANY_OWNER', 'PM', 'FOREMAN'].includes(targetUser.role);
            }
            return false;
        });

        filteredUsers.forEach(u => {
            rooms.push({
                id: u._id,
                name: u.fullName,
                isGroup: false,
                type: 'private',
                role: u.role,
                avatar: u.avatar
            });
        });

        res.json(rooms);
    } catch (error) {
        next(error);
    }
};

// @desc    Get chat history for a project
// @route   GET /api/chat/:projectId
// @access  Private
const getProjectChat = async (req, res, next) => {
    try {
        if (req.params.projectId === 'GENERAL_COMPANY') {
            const chats = await Chat.find({
                companyId: req.user.companyId,
                projectId: null,
                receiverId: null
            }).populate('sender', 'fullName role');
            return res.json(chats);
        }

        const project = await Project.findById(req.params.projectId);
        if (!project) {
            res.status(404);
            return next(new Error('Project not found'));
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

        let chatData = {
            companyId: req.user.companyId,
            sender: req.user._id,
            message,
            attachments
        };

        if (projectId && projectId !== 'GENERAL_COMPANY') {
            const project = await Project.findById(projectId);
            if (!project) {
                res.status(404);
                return next(new Error('Project not found'));
            }
            chatData.projectId = projectId;
        } else if (receiverId) {
            chatData.receiverId = receiverId;
        } else if (projectId === 'GENERAL_COMPANY') {
            // General company chat has no projectId or receiverId in DB
            chatData.projectId = null;
            chatData.receiverId = null;
        } else {
            res.status(400);
            return next(new Error('Target is required'));
        }

        const chat = await Chat.create(chatData);

        // Final chat object for emission (populate sender)
        const fullChat = await Chat.findById(chat._id).populate('sender', 'fullName role');

        // Emit via Socket.io if available
        const io = req.app.get('io');
        if (io) {
            if (projectId) {
                // Emit to project room or company room
                io.to(projectId).emit('new_message', fullChat);
            } else if (receiverId) {
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
    getChatRooms,
    getProjectChat,
    getPrivateChat,
    sendMessage
};
