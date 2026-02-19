const Job = require('../models/Job');
const Project = require('../models/Project');

// Helper to update project progress and status based on jobs
const updateProjectStats = async (projectId) => {
    try {
        const jobs = await Job.find({ projectId });
        if (jobs.length === 0) {
            await Project.findByIdAndUpdate(projectId, { progress: 0, status: 'planning' });
            return;
        }

        const completedJobs = jobs.filter(j => j.status === 'completed').length;
        const activeJobs = jobs.filter(j => j.status === 'active' || j.status === 'on-hold').length;
        const progress = Math.round((completedJobs / jobs.length) * 100);

        let status = 'planning';
        if (progress === 100) {
            status = 'completed';
        } else if (progress > 0 || activeJobs > 0) {
            status = 'active';
        }

        await Project.findByIdAndUpdate(projectId, { progress, status });
    } catch (err) {
        console.error('Error updating project stats:', err);
    }
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
        const job = await Job.create({
            ...req.body,
            companyId: req.user.companyId,
            createdBy: req.user._id
        });

        // Sync project stats
        await updateProjectStats(job.projectId);

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
