const TimeLog = require('../models/TimeLog');
const Project = require('../models/Project');

// Helper to calculate distance between two GPS points (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};

// @desc    Clock In
// @route   POST /api/timelogs/clock-in
// @access  Private
const clockIn = async (req, res, next) => {
    try {
        const { projectId, latitude, longitude, deviceInfo, userId } = req.body;
        const targetUserId = userId || req.user._id;

        // Check if already clocked in
        const activeLog = await TimeLog.findOne({
            userId: targetUserId,
            clockOut: null
        });

        if (activeLog) {
            res.status(400);
            throw new Error('User already clocked in');
        }

        let geofenceStatus = 'unknown';

        if (projectId && latitude && longitude) {
            const project = await Project.findById(projectId);
            if (project && project.location && project.location.latitude) {
                const distance = calculateDistance(
                    latitude, longitude,
                    project.location.latitude, project.location.longitude
                );
                geofenceStatus = distance <= (project.geofenceRadius || 200) ? 'inside' : 'outside';
            }
        }

        const log = await TimeLog.create({
            companyId: req.user.companyId,
            userId: targetUserId,
            projectId,
            clockIn: new Date(),
            gpsIn: { latitude, longitude },
            geofenceStatus,
            deviceInfo
        });

        res.status(201).json(log);
    } catch (error) {
        next(error);
    }
};

// @desc    Clock Out
// @route   POST /api/timelogs/clock-out
// @access  Private
const clockOut = async (req, res, next) => {
    try {
        const { latitude, longitude, userId } = req.body;
        const targetUserId = userId || req.user._id;

        const log = await TimeLog.findOne({
            userId: targetUserId,
            clockOut: null
        });

        if (!log) {
            res.status(400);
            throw new Error('User not clocked in');
        }

        log.clockOut = new Date();
        log.gpsOut = { latitude, longitude };
        await log.save();

        res.json(log);
    } catch (error) {
        next(error);
    }
};

// @desc    Get TimeLogs
// @route   GET /api/timelogs
// @access  Private
const getTimeLogs = async (req, res, next) => {
    try {
        const query = { companyId: req.user.companyId };

        if (req.query.userId) query.userId = req.query.userId;
        if (req.query.projectId) query.projectId = req.query.projectId;

        const logs = await TimeLog.find(query)
            .populate('userId', 'fullName email')
            .populate('projectId', 'name')
            .sort({ clockIn: -1 });

        res.json(logs);
    } catch (error) {
        next(error);
    }
};

// @desc    Update TimeLog (Approve/Reject)
// @route   PATCH /api/timelogs/:id
// @access  Private (PM, COMPANY_OWNER)
const updateTimeLog = async (req, res, next) => {
    try {
        const log = await TimeLog.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!log) {
            res.status(404);
            throw new Error('TimeLog not found');
        }

        const updatedLog = await TimeLog.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        }).populate('userId', 'fullName email').populate('projectId', 'name');

        res.json(updatedLog);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    clockIn,
    clockOut,
    getTimeLogs,
    updateTimeLog
};
