const Job = require('../models/Job');
const Project = require('../models/Project');
const { dispatchNotification } = require('../utils/notificationHelper');

// Helper to update project stats (Disabled automatic progress/status as per manual control requirement)
const updateProjectStats = async (projectId) => {
    // Automatic updates disabled to allow manual admin control over project progress and status
    return;
};

// GET /jobs?projectId=xxx  — list jobs for a project
const getJobs = async (req, res) => {
    try {
        const filter = { companyId: req.user.companyId };

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
            filter.assignedWorkers = req.user._id;
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

        // Workers can only update status
        if (req.user.role === 'WORKER') {
            const { status } = req.body;
            job.status = status || job.status;
        } else {
            Object.assign(job, req.body);
        }

        await job.save();

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

module.exports = { getJobs, getJobById, createJob, updateJob, deleteJob };
