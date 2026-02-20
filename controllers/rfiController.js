const RFI = require('../models/RFI');

// @desc    Get all RFIs for a company
// @route   GET /api/rfis
// @access  Private
const getRFIs = async (req, res, next) => {
    try {
        const query = { companyId: req.user.companyId };
        if (req.query.projectId) query.projectId = req.query.projectId;
        if (req.query.status) query.status = req.query.status;
        if (req.query.priority) query.priority = req.query.priority;

        const rfis = await RFI.find(query)
            .populate('projectId', 'name')
            .populate('raisedBy', 'fullName email role')
            .populate('assignedTo', 'fullName email role')
            .populate('comments.author', 'fullName role')
            .sort({ createdAt: -1 });

        // Add overdue flag
        const now = new Date();
        const result = rfis.map(r => {
            const obj = r.toJSON();
            obj.isOverdue = r.dueDate && r.status !== 'closed' && new Date(r.dueDate) < now;
            return obj;
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
};

// @desc    Get RFI dashboard stats
// @route   GET /api/rfis/stats
// @access  Private
const getRFIStats = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const now = new Date();

        const [total, open, inReview, answered, closed, overdue, highPriority, recent] = await Promise.all([
            RFI.countDocuments({ companyId }),
            RFI.countDocuments({ companyId, status: 'open' }),
            RFI.countDocuments({ companyId, status: 'in_review' }),
            RFI.countDocuments({ companyId, status: 'answered' }),
            RFI.countDocuments({ companyId, status: 'closed' }),
            RFI.countDocuments({ companyId, status: { $ne: 'closed' }, dueDate: { $lt: now } }),
            RFI.find({ companyId, priority: 'high', status: { $ne: 'closed' } })
                .populate('projectId', 'name')
                .populate('raisedBy', 'fullName')
                .sort({ createdAt: -1 })
                .limit(5),
            RFI.find({ companyId })
                .populate('projectId', 'name')
                .populate('raisedBy', 'fullName')
                .populate('assignedTo', 'fullName')
                .sort({ createdAt: -1 })
                .limit(5),
        ]);

        const overdueList = await RFI.find({
            companyId,
            status: { $ne: 'closed' },
            dueDate: { $lt: now }
        })
            .populate('projectId', 'name')
            .populate('assignedTo', 'fullName')
            .sort({ dueDate: 1 })
            .limit(5);

        res.json({
            stats: { total, open, inReview, answered, closed, overdue },
            recentRFIs: recent,
            highPriorityRFIs: highPriority,
            overdueRFIs: overdueList
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single RFI
// @route   GET /api/rfis/:id
// @access  Private
const getRFIById = async (req, res, next) => {
    try {
        const rfi = await RFI.findOne({ _id: req.params.id, companyId: req.user.companyId })
            .populate('projectId', 'name')
            .populate('raisedBy', 'fullName email role')
            .populate('assignedTo', 'fullName email role')
            .populate('comments.author', 'fullName role');

        if (!rfi) {
            res.status(404);
            throw new Error('RFI not found');
        }

        const obj = rfi.toJSON();
        obj.isOverdue = rfi.dueDate && rfi.status !== 'closed' && new Date(rfi.dueDate) < new Date();
        res.json(obj);
    } catch (error) {
        next(error);
    }
};

// @desc    Create RFI
// @route   POST /api/rfis
// @access  Private
const createRFI = async (req, res, next) => {
    try {
        const rfi = await RFI.create({
            ...req.body,
            companyId: req.user.companyId,
            raisedBy: req.user._id
        });

        const populated = await RFI.findById(rfi._id)
            .populate('projectId', 'name')
            .populate('raisedBy', 'fullName role')
            .populate('assignedTo', 'fullName role');

        res.status(201).json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc    Update RFI (status, reassign, response)
// @route   PATCH /api/rfis/:id
// @access  Private
const updateRFI = async (req, res, next) => {
    try {
        const rfi = await RFI.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!rfi) {
            res.status(404);
            throw new Error('RFI not found');
        }

        const updated = await RFI.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        })
            .populate('projectId', 'name')
            .populate('raisedBy', 'fullName role')
            .populate('assignedTo', 'fullName role')
            .populate('comments.author', 'fullName role');

        res.json(updated);
    } catch (error) {
        next(error);
    }
};

// @desc    Add comment to RFI
// @route   POST /api/rfis/:id/comments
// @access  Private
const addComment = async (req, res, next) => {
    try {
        const { text } = req.body;
        if (!text) {
            res.status(400);
            throw new Error('Comment text is required');
        }

        const rfi = await RFI.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!rfi) {
            res.status(404);
            throw new Error('RFI not found');
        }

        rfi.comments.push({ author: req.user._id, text });
        await rfi.save();

        const updated = await RFI.findById(rfi._id)
            .populate('projectId', 'name')
            .populate('raisedBy', 'fullName role')
            .populate('assignedTo', 'fullName role')
            .populate('comments.author', 'fullName role');

        res.json(updated);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete RFI
// @route   DELETE /api/rfis/:id
// @access  Private (Owner/PM only)
const deleteRFI = async (req, res, next) => {
    try {
        const rfi = await RFI.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
        if (!rfi) {
            res.status(404);
            throw new Error('RFI not found');
        }
        res.json({ message: 'RFI deleted' });
    } catch (error) {
        next(error);
    }
};

module.exports = { getRFIs, getRFIStats, getRFIById, createRFI, updateRFI, addComment, deleteRFI };
