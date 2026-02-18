const Task = require('../models/Task');

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res, next) => {
    try {
        const query = { companyId: req.user.companyId };

        if (req.query.projectId) query.projectId = req.query.projectId;
        if (req.query.status) query.status = req.query.status;
        if (req.query.assignedTo) query.assignedTo = req.query.assignedTo;

        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedTo', 'fullName email')
            .populate('createdBy', 'fullName');

        res.json(tasks);
    } catch (error) {
        next(error);
    }
};

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
const createTask = async (req, res, next) => {
    try {
        const task = await Task.create({
            ...req.body,
            companyId: req.user.companyId,
            createdBy: req.user._id
        });
        res.status(201).json(task);
    } catch (error) {
        next(error);
    }
};

// @desc    Update task
// @route   PATCH /api/tasks/:id
// @access  Private
const updateTask = async (req, res, next) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!task) {
            res.status(404);
            throw new Error('Task not found');
        }

        // If trying to complete, check OTP if it exists
        if (req.body.status === 'completed' && task.completionOTP) {
            if (req.body.otp !== task.completionOTP) {
                res.status(400);
                throw new Error('Invalid Completion OTP');
            }
        }

        const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.json(updatedTask);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = async (req, res, next) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!task) {
            res.status(404);
            throw new Error('Task not found');
        }

        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'Task removed' });
    } catch (error) {
        next(error);
    }
};

// @desc    Get my tasks
// @route   GET /api/tasks/my-tasks
// @access  Private
const getMyTasks = async (req, res, next) => {
    try {
        const tasks = await Task.find({
            companyId: req.user.companyId,
            assignedTo: req.user._id
        })
            .populate('projectId', 'name')
            .sort({ dueDate: 1 });

        res.json(tasks);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTasks,
    getMyTasks,
    createTask,
    updateTask,
    deleteTask
};
