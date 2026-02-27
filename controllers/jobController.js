const Job = require('../models/Job');
const Project = require('../models/Project');
const JobWorker = require('../models/JobWorker');
const JobTimeLog = require('../models/JobTimeLog');
const JobActivityLog = require('../models/JobActivityLog');
const { dispatchNotification } = require('../utils/notificationHelper');
const mongoose = require('mongoose');

// Helper to update project stats (Disabled automatic progress/status as per manual control requirement)
const updateProjectStats = async (projectId) => {
    // Automatic updates disabled to allow manual admin control over project progress and status
    return;
};

// GET /jobs?projectId=xxx  — list jobs for a project
const getJobs = async (req, res) => {
    try {
        const filter = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            filter.companyId = req.user.companyId;
        }

        // If projectId is provided, use it
        if (req.query.projectId) {
            filter.projectId = req.query.projectId;
        }

        // Role-based visibility
        if (req.user.role === 'PM') {
            // PM sees jobs for projects where they are the PM OR the creator
            const managedProjects = await Project.find({
                companyId: req.user.companyId,
                $or: [{ pmId: req.user._id }, { createdBy: req.user._id }]
            }).select('_id');
            const projectIds = managedProjects.map(p => p._id);

            // Visibility criteria for PM:
            // 1. Job is in a project they manage (PM/Creator)
            // 2. Job was created by them
            // 3. Job is assigned to them as a foreman (dual role)
            filter.$or = [
                { projectId: { $in: projectIds } },
                { createdBy: req.user._id },
                { foremanId: req.user._id }
            ];
        } else if (req.user.role === 'FOREMAN') {
            filter.foremanId = req.user._id;
        } else if (req.user.role === 'WORKER') {
            filter.assignedWorkers = { $in: [req.user._id] };
        }

        const jobs = await Job.find(filter)
            .populate('foremanId', 'fullName role')
            .populate('assignedWorkers', 'fullName role')
            .populate({
                path: 'projectId',
                select: 'name pmId',
                populate: { path: 'pmId', select: 'fullName' }
            })
            .sort({ createdAt: -1 });
        res.json(jobs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /jobs/:id
const getJobById = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('foremanId', 'fullName role')
            .populate('assignedWorkers', 'fullName role')
            .populate({
                path: 'projectId',
                select: 'name pmId',
                populate: { path: 'pmId', select: 'fullName' }
            });
        if (!job) return res.status(404).json({ message: 'Job not found' });
        res.json(job);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /jobs
const createJob = async (req, res) => {
    try {
        const { equipmentIds, ...jobData } = req.body;
        const job = await Job.create({
            ...jobData,
            companyId: req.user.companyId,
            createdBy: req.user._id
        });

        // If equipmentIds are provided, assign them to the new job
        if (equipmentIds && Array.isArray(equipmentIds)) {
            const Equipment = require('../models/Equipment');
            await Equipment.updateMany(
                { _id: { $in: equipmentIds }, companyId: req.user.companyId },
                {
                    assignedJob: job._id,
                    assignedDate: new Date(),
                    status: 'operational'
                }
            );
        }

        // Sync project stats
        await updateProjectStats(job.projectId);

        // Sync Chat Participants
        try {
            const { syncProjectParticipants } = require('./chatController');
            await syncProjectParticipants(job.projectId);

            // Notify Foreman
            if (job.foremanId) {
                await dispatchNotification(req, {
                    userId: job.foremanId,
                    title: 'New Job Assigned',
                    message: `You have been assigned as Foreman for job: "${job.name}"`,
                    link: '/projects',
                    type: 'project'
                });
            }

            // Notify Workers
            for (const workerId of (job.assignedWorkers || [])) {
                await dispatchNotification(req, {
                    userId: workerId,
                    title: 'New Job Assignment',
                    message: `You have been assigned to job: "${job.name}"`,
                    link: '/projects',
                    type: 'project'
                });
            }
        } catch (syncError) {
            console.error('Job Create: Failed to sync chat participants/notifications:', syncError);
        }

        // Create initial Activity Log
        await JobActivityLog.create({
            jobId: job._id,
            actionType: 'CREATED',
            description: `Job "${job.name}" was created.`,
            createdBy: req.user._id
        });

        // Record initial worker assignments
        if (job.assignedWorkers && job.assignedWorkers.length > 0) {
            const workerAssignments = job.assignedWorkers.map(wId => ({
                jobId: job._id,
                workerId: wId,
                assignedAt: new Date()
            }));
            await JobWorker.insertMany(workerAssignments);

            await JobActivityLog.create({
                jobId: job._id,
                actionType: 'WORKER_ADDED',
                description: `${job.assignedWorkers.length} workers assigned at creation.`,
                createdBy: req.user._id
            });
        }

        if (job.foremanId) {
            await JobActivityLog.create({
                jobId: job._id,
                actionType: 'FOREMAN_CHANGED',
                description: `Foreman assigned during creation.`,
                createdBy: req.user._id
            });
        }

        const populated = await job.populate('foremanId', 'fullName role');
        res.status(201).json(populated);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// PATCH /jobs/:id
const updateJob = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        const oldStatus = job.status;
        const oldForemanId = job.foremanId?.toString();
        const oldWorkers = job.assignedWorkers.map(id => id.toString());

        // Workers can only update status
        if (req.user.role === 'WORKER') {
            const { status } = req.body;
            job.status = status || job.status;
        } else {
            Object.assign(job, req.body);
        }

        await job.save();

        // 1. Log Status Change
        if (req.body.status && req.body.status !== oldStatus) {
            await JobActivityLog.create({
                jobId: job._id,
                actionType: 'STATUS_CHANGED',
                description: `Status changed from ${oldStatus} to ${req.body.status}.`,
                createdBy: req.user._id
            });
            if (req.body.status === 'completed') {
                await JobActivityLog.create({
                    jobId: job._id,
                    actionType: 'COMPLETED',
                    description: `Job marked as completed.`,
                    createdBy: req.user._id
                });
            }
        }

        // 2. Log Foreman Change
        if (req.body.foremanId && req.body.foremanId.toString() !== oldForemanId) {
            await JobActivityLog.create({
                jobId: job._id,
                actionType: 'FOREMAN_CHANGED',
                description: `Foreman changed.`,
                createdBy: req.user._id
            });
        }

        // 3. Log & Update Worker Assignments
        if (req.body.assignedWorkers) {
            const newWorkers = req.body.assignedWorkers.map(id => {
                if (typeof id === 'object' && id !== null) {
                    return (id._id || id).toString();
                }
                return id.toString();
            });

            // Freshly added
            const added = newWorkers.filter(id => !oldWorkers.includes(id));
            if (added.length > 0) {
                await JobWorker.insertMany(added.map(wId => ({
                    jobId: job._id,
                    workerId: wId,
                    assignedAt: new Date()
                })));
                await JobActivityLog.create({
                    jobId: job._id,
                    actionType: 'WORKER_ADDED',
                    description: `Added ${added.length} workers to job.`,
                    createdBy: req.user._id
                });
            }

            // Removed
            const removed = oldWorkers.filter(id => !newWorkers.includes(id));
            if (removed.length > 0) {
                await JobWorker.updateMany(
                    { jobId: job._id, workerId: { $in: removed }, removedAt: { $exists: false } },
                    { removedAt: new Date() }
                );
                await JobActivityLog.create({
                    jobId: job._id,
                    actionType: 'WORKER_REMOVED',
                    description: `Removed ${removed.length} workers from job.`,
                    createdBy: req.user._id
                });
            }
        }

        // Sync project stats
        await updateProjectStats(job.projectId);

        // Sync Chat Participants
        try {
            const { syncProjectParticipants } = require('./chatController');
            await syncProjectParticipants(job.projectId);

            // Notify Foreman (if changed or set)
            if (job.foremanId) {
                await dispatchNotification(req, {
                    userId: job.foremanId,
                    title: 'Job Updated',
                    message: `Assignments updated for job: "${job.name}"`,
                    link: '/projects',
                    type: 'project'
                });
            }

            // Notify Workers
            for (const workerId of (job.assignedWorkers || [])) {
                await dispatchNotification(req, {
                    userId: workerId,
                    title: 'Job Updated',
                    message: `Assignments updated for job: "${job.name}"`,
                    link: '/projects',
                    type: 'project'
                });
            }
        } catch (syncError) {
            console.error('Job Update: Failed to sync chat participants/notifications:', syncError);
        }

        const populated = await Job.findById(job._id)
            .populate('foremanId', 'fullName role')
            .populate('assignedWorkers', 'fullName role');
        res.json(populated);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// DELETE /jobs/:id
const deleteJob = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        const projectId = job.projectId;
        await Job.findByIdAndDelete(req.params.id);

        // Sync project stats
        await updateProjectStats(projectId);

        res.json({ message: 'Job deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /jobs/:id/full-history
const getJobFullHistory = async (req, res) => {
    try {
        const jobId = req.params.id;
        const job = await Job.findById(jobId)
            .populate('projectId', 'name')
            .populate('foremanId', 'fullName')
            .populate('assignedWorkers', 'fullName');

        if (!job) return res.status(404).json({ message: 'Job not found' });

        // 1. Fetch Daily Logs
        const dailyLogs = await JobTimeLog.find({ jobId })
            .populate('workerId', 'fullName')
            .sort({ workDate: -1, checkIn: -1 });

        // 2. Fetch Activity Logs
        const activityLogs = await JobActivityLog.find({ jobId })
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 });

        // 3. Aggregate Worker Summary
        // We'll calculate totals from time logs
        const workerStats = await JobTimeLog.aggregate([
            { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
            {
                $group: {
                    _id: '$workerId',
                    totalHours: { $sum: '$totalHours' },
                    totalDays: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$workDate" } } }
                }
            },
            {
                $project: {
                    workerId: '$_id',
                    totalHours: 1,
                    totalDays: { $size: '$totalDays' },
                    avgHours: { $cond: [{ $eq: ['$totalDays', 0] }, 0, { $divide: ['$totalHours', { $size: '$totalDays' }] }] }
                }
            }
        ]);

        // Populate worker names for stats
        const User = require('../models/User');
        const populatedWorkerStats = await Promise.all(workerStats.map(async (stat) => {
            const user = await User.findById(stat.workerId).select('fullName');
            return {
                ...stat,
                workerName: user ? user.fullName : 'Unknown'
            };
        }));

        res.json({
            job_details: job,
            worker_summary: populatedWorkerStats,
            daily_logs: dailyLogs,
            activity_logs: activityLogs
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /jobs/:id/history-pdf
const generateJobHistoryPDF = async (req, res) => {
    try {
        const jobId = req.params.id;
        const job = await Job.findById(jobId)
            .populate('projectId', 'name')
            .populate('foremanId', 'fullName');

        if (!job) return res.status(404).json({ message: 'Job not found' });

        const dailyLogs = await JobTimeLog.find({ jobId })
            .populate('workerId', 'fullName')
            .sort({ workDate: -1 });

        const activityLogs = await JobActivityLog.find({ jobId })
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 });

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        let filename = `${job.name}_History.pdf`;
        filename = encodeURIComponent(filename);
        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');

        // Header
        doc.fillColor('#444444').fontSize(20).text('Job Full History Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).fillColor('#000000');
        doc.text(`Project: ${job.projectId?.name || 'N/A'}`);
        doc.text(`Job Name: ${job.name}`);
        doc.text(`Foreman: ${job.foremanId?.fullName || 'Unassigned'}`);
        doc.text(`Status: ${job.status.toUpperCase()}`);
        doc.text(`Date Generated: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        // Worker Summary (Aggregate for PDF)
        doc.fontSize(16).fillColor('#333333').text('Worker Summary', { underline: true });
        doc.moveDown(0.5);

        const workerStats = await JobTimeLog.aggregate([
            { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
            {
                $group: {
                    _id: '$workerId',
                    totalHours: { $sum: '$totalHours' },
                    days: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$workDate" } } }
                }
            }
        ]);

        const User = require('../models/User');
        for (const stat of workerStats) {
            const user = await User.findById(stat._id).select('fullName');
            doc.fontSize(10).fillColor('#000000')
                .text(`${user?.fullName || 'Unknown'}: ${stat.totalHours.toFixed(2)} hrs over ${stat.days.length} days`);
        }
        doc.moveDown();

        // Daily Logs
        doc.fontSize(16).fillColor('#333333').text('Daily Time Logs', { underline: true });
        doc.moveDown(0.5);
        dailyLogs.forEach(log => {
            doc.fontSize(10).fillColor('#444444')
                .text(`${new Date(log.workDate).toLocaleDateString()} - ${log.workerId?.fullName || 'Unknown'}: ${log.totalHours} hrs (${new Date(log.checkIn).toLocaleTimeString()} - ${log.checkOut ? new Date(log.checkOut).toLocaleTimeString() : 'N/A'})`);
        });
        doc.moveDown();

        // Activity Timeline
        doc.fontSize(16).fillColor('#333333').text('Activity Timeline', { underline: true });
        doc.moveDown(0.5);
        activityLogs.forEach(log => {
            doc.fontSize(10).fillColor('#666666')
                .text(`[${new Date(log.createdAt).toLocaleString()}] ${log.actionType}: ${log.description} (by ${log.createdBy?.fullName || 'System'})`);
        });

        doc.pipe(res);
        doc.end();

    } catch (err) {
        console.error('PDF Generation Error:', err);
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    getJobs,
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    getJobFullHistory,
    generateJobHistoryPDF
};
