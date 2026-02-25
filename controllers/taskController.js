const Task = require('../models/Task');
const Job = require('../models/Job');
const AuditLog = require('../models/AuditLog');
const { dispatchNotification } = require('../utils/notificationHelper');

// @desc    Get tasks (role-based)
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res, next) => {
    try {
        const { role, _id: userId, companyId } = req.user;
        const query = { companyId };

        if (req.query.projectId) query.projectId = req.query.projectId;
        if (req.query.status) query.status = req.query.status;
        if (req.query.priority) query.priority = req.query.priority;
        if (req.query.assignedRoleType) query.assignedRoleType = req.query.assignedRoleType;

        // WORKER or SUBCONTRACTOR: only own assigned tasks
        if (['WORKER', 'SUBCONTRACTOR'].includes(role)) {
            query.assignedTo = userId;
        }
        // FOREMAN: own tasks + tasks assigned to workers in their managed jobs
        else if (role === 'FOREMAN') {
            const managedJobs = await Job.find({ foremanId: userId, companyId }).select('assignedWorkers');
            const workerIds = managedJobs.flatMap(j => j.assignedWorkers || []);
            const allIds = [userId, ...workerIds];
            query.assignedTo = { $in: allIds };
        }
        // PM / COMPANY_OWNER / SUPER_ADMIN / ENGINEER: all company tasks

        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedTo', 'fullName email role')
            .populate('createdBy', 'fullName')
            .populate('assignedBy', 'fullName')
            .sort({ dueDate: 1, createdAt: -1 });

        res.json(tasks);
    } catch (error) {
        next(error);
    }
};

// @desc    Get tasks assigned to the logged-in user
// @route   GET /api/tasks/my-tasks
// @access  Private
const getMyTasks = async (req, res, next) => {
    try {
        const query = {
            companyId: req.user.companyId,
            assignedTo: req.user._id
        };
        if (req.query.status) query.status = req.query.status;

        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'fullName role')
            .populate('createdBy', 'fullName')
            .sort({ dueDate: 1 });

        res.json(tasks);
    } catch (error) {
        next(error);
    }
};

// @desc    Get all tasks for a specific project
// @route   GET /api/tasks/project/:projectId
// @access  Private
const getProjectTasks = async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const { role, _id: userId, companyId } = req.user;

        const query = { companyId, projectId };

        // Workers/Subcontractors see only their own tasks for the project
        if (['WORKER', 'SUBCONTRACTOR'].includes(role)) {
            query.assignedTo = userId;
        } else if (role === 'FOREMAN') {
            const managedJobs = await Job.find({ foremanId: userId, companyId }).select('assignedWorkers');
            const workerIds = managedJobs.flatMap(j => j.assignedWorkers || []);
            const allIds = [userId, ...workerIds];
            query.assignedTo = { $in: allIds };
        }

        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedTo', 'fullName email role')
            .populate('assignedBy', 'fullName role')
            .populate('createdBy', 'fullName')
            .sort({ dueDate: 1 });

        res.json(tasks);
    } catch (error) {
        next(error);
    }
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private (Admin, PM, Foreman)
const createTask = async (req, res, next) => {
    try {
        const { title, description, projectId, assignedTo, assignedRoleType, priority, status, dueDate, startDate } = req.body;

        if (!projectId) {
            res.status(400);
            throw new Error('projectId is required');
        }

        const assignedToArr = assignedTo
            ? (Array.isArray(assignedTo) ? assignedTo : [assignedTo]).filter(Boolean)
            : [];

        const task = await Task.create({
            companyId: req.user.companyId,
            projectId,
            title,
            description: description || '',
            assignedTo: assignedToArr,
            assignedRoleType: assignedRoleType || '',
            assignedBy: assignedToArr.length > 0 ? req.user._id : undefined,
            priority: priority || 'Medium',
            status: status || 'todo',
            dueDate: dueDate || undefined,
            startDate: startDate || undefined,
            createdBy: req.user._id,
            statusHistory: [{ status: status || 'todo', changedBy: req.user._id }]
        });

        // Notify each assigned user
        for (const uid of assignedToArr) {
            await dispatchNotification(req, {
                userId: uid,
                title: 'New Task Assigned',
                message: `You have been assigned: "${title}" by ${req.user.fullName}`,
                link: '/tasks',
                type: 'task'
            });
        }

        // Audit log
        await AuditLog.create({
            userId: req.user._id,
            action: 'TASK_CREATED',
            module: 'TASKS',
            details: `Created task "${title}"`,
            metadata: { taskId: task._id, projectId, assignedTo: assignedToArr }
        });

        // Sync Chat Participants
        try {
            const { syncProjectParticipants } = require('./chatController');
            await syncProjectParticipants(projectId);
        } catch (syncError) {
            console.error('Task Create: Failed to sync chat participants:', syncError);
        }

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedTo', 'fullName email role')
            .populate('assignedBy', 'fullName')
            .populate('createdBy', 'fullName');

        res.status(201).json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc    Assign / reassign task to user(s)
// @route   PUT /api/tasks/:id/assign
// @access  Private (Admin, PM, Foreman)
const assignTask = async (req, res, next) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!task) {
            res.status(404);
            throw new Error('Task not found');
        }

        const { assignedTo, assignedRoleType } = req.body;
        const assignedToArr = assignedTo
            ? (Array.isArray(assignedTo) ? assignedTo : [assignedTo]).filter(Boolean)
            : [];

        // Track previous assignees to notify new ones only
        const previousIds = task.assignedTo.map(id => id.toString());
        const newlyAssigned = assignedToArr.filter(id => !previousIds.includes(id.toString()));

        task.assignedTo = assignedToArr;
        task.assignedRoleType = assignedRoleType || task.assignedRoleType;
        task.assignedBy = req.user._id;
        task.statusHistory.push({ status: task.status, changedBy: req.user._id, note: `Reassigned by ${req.user.fullName}` });

        await task.save();

        // Notify newly assigned users
        for (const uid of newlyAssigned) {
            await dispatchNotification(req, {
                userId: uid,
                title: 'Task Assigned to You',
                message: `"${task.title}" has been assigned to you by ${req.user.fullName}`,
                link: '/tasks',
                type: 'task'
            });
        }

        await AuditLog.create({
            userId: req.user._id,
            action: 'TASK_ASSIGNED',
            module: 'TASKS',
            details: `Assigned task "${task.title}" to ${assignedToArr.join(', ')}`,
            metadata: { taskId: task._id, assignedTo: assignedToArr }
        });

        // Sync Chat Participants
        try {
            const { syncProjectParticipants } = require('./chatController');
            await syncProjectParticipants(task.projectId);
        } catch (syncError) {
            console.error('Task Assign: Failed to sync chat participants:', syncError);
        }

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedTo', 'fullName email role')
            .populate('assignedBy', 'fullName');

        res.json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc    Update task (status, title, etc.)
// @route   PATCH /api/tasks/:id
// @access  Private
const updateTask = async (req, res, next) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!task) {
            res.status(404);
            throw new Error('Task not found');
        }

        const { role, _id: userId } = req.user;
        const isAdmin = ['SUPER_ADMIN', 'COMPANY_OWNER', 'PM'].includes(role);
        const isForeman = role === 'FOREMAN';
        const isAssigned = task.assignedTo.some(id => id.toString() === userId.toString());

        // Workers/Subcontractors can only update status of their own tasks — not reassign
        if (['WORKER', 'SUBCONTRACTOR'].includes(role)) {
            if (!isAssigned) {
                res.status(403);
                throw new Error('You can only update tasks assigned to you');
            }
            // Strip reassignment fields
            delete req.body.assignedTo;
            delete req.body.assignedBy;
            delete req.body.assignedRoleType;
        }

        // Foreman cannot modify tasks owned by admin
        if (isForeman && !isAssigned && !isAdmin) {
            delete req.body.assignedTo;
        }

        // OTP check if completing
        if (req.body.status === 'completed' && task.completionOTP) {
            if (req.body.otp !== task.completionOTP) {
                res.status(400);
                throw new Error('Invalid Completion OTP');
            }
        }

        // Track status change
        if (req.body.status && req.body.status !== task.status) {
            task.statusHistory.push({ status: req.body.status, changedBy: userId });
        }

        Object.assign(task, req.body);
        // Re-resolve assignedTo as array
        if (req.body.assignedTo && !Array.isArray(req.body.assignedTo)) {
            task.assignedTo = [req.body.assignedTo].filter(Boolean);
        }

        await task.save();

        // Sync Chat Participants if assignedTo changed
        if (req.body.assignedTo) {
            try {
                const { syncProjectParticipants } = require('./chatController');
                await syncProjectParticipants(task.projectId);
            } catch (syncError) {
                console.error('Task Update: Failed to sync chat participants:', syncError);
            }
        }

        await AuditLog.create({
            userId: req.user._id,
            action: 'TASK_UPDATED',
            module: 'TASKS',
            details: `Updated task "${task.title}"`,
            metadata: { taskId: task._id, changes: req.body }
        });

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedTo', 'fullName email role')
            .populate('assignedBy', 'fullName')
            .populate('createdBy', 'fullName');

        // Notify creator if worker marked complete
        if (req.body.status === 'completed' && task.createdBy?.toString() !== userId.toString()) {
            await dispatchNotification(req, {
                userId: task.createdBy,
                title: 'Task Completed',
                message: `"${task.title}" has been marked complete by ${req.user.fullName}`,
                link: '/tasks'
            });
        }

        res.json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin, PM only)
const deleteTask = async (req, res, next) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!task) {
            res.status(404);
            throw new Error('Task not found');
        }

        await Task.findByIdAndDelete(req.params.id);

        await AuditLog.create({
            userId: req.user._id,
            action: 'TASK_DELETED',
            module: 'TASKS',
            details: `Deleted task "${task.title}"`,
            metadata: { taskId: task._id }
        });

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTasks,
    getMyTasks,
    getProjectTasks,
    createTask,
    assignTask,
    updateTask,
    deleteTask
};
