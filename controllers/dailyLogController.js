const DailyLog = require('../models/DailyLog');

// @desc    Get all daily logs
// @route   GET /api/dailylogs
// @access  Private
const getDailyLogs = async (req, res, next) => {
    try {
        const query = { companyId: req.user.companyId };

        // Filter projects for clients
        if (req.user.role === 'CLIENT') {
            const Project = require('../models/Project');
            const clientProjects = await Project.find({ clientId: req.user._id }).select('_id');
            const projectIds = clientProjects.map(p => p._id);
            query.projectId = { $in: projectIds };
        }

        if (req.query.projectId) {
            // If projectId is provided, ensure it's one of the client's projects
            if (req.user.role === 'CLIENT' && !query.projectId.$in.some(id => id.toString() === req.query.projectId)) {
                return res.status(403).json({ message: 'Not authorized to access this project logs' });
            }
            query.projectId = req.query.projectId;
        }
        if (req.query.date) query.date = req.query.date;

        const logs = await DailyLog.find(query)
            .populate('projectId', 'name')
            .populate('reportedBy', 'fullName')
            .sort({ date: -1 });

        res.json(logs);
    } catch (error) {
        next(error);
    }
};

// @desc    Create daily log
// @route   POST /api/dailylogs
// @access  Private (Foreman, PM)
const createDailyLog = async (req, res, next) => {
    try {
        const log = await DailyLog.create({
            ...req.body,
            companyId: req.user.companyId,
            reportedBy: req.user._id
        });
        res.status(201).json(log);
    } catch (error) {
        next(error);
    }
};

// @desc    Verify daily log
// @route   POST /api/dailylogs/:id/verify
// @access  Private (PM, Owners)
const verifyDailyLog = async (req, res, next) => {
    try {
        const log = await DailyLog.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!log) {
            res.status(404);
            throw new Error('Daily log not found');
        }

        log.isVerified = true;
        log.verifiedBy = req.user._id;
        await log.save();

        res.json(log);
    } catch (error) {
        next(error);
    }
};

const deleteDailyLog = async (req, res, next) => {
    try {
        const log = await DailyLog.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
        if (!log) {
            res.status(404);
            throw new Error('Daily log not found');
        }
        res.json({ message: 'Daily log removed' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDailyLogs,
    createDailyLog,
    verifyDailyLog,
    deleteDailyLog
};
