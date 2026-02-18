const Job = require('../models/Job');

// GET /jobs?projectId=xxx  — list jobs for a project
const getJobs = async (req, res) => {
    try {
        const filter = { companyId: req.user.companyId };
        if (req.query.projectId) filter.projectId = req.query.projectId;
        const jobs = await Job.find(filter)
            .populate('foremanId', 'fullName role')
            .populate('projectId', 'name')
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
            .populate('projectId', 'name');
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
        const populated = await job.populate('foremanId', 'fullName role');
        res.status(201).json(populated);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// PATCH /jobs/:id
const updateJob = async (req, res) => {
    try {
        const job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true })
            .populate('foremanId', 'fullName role');
        if (!job) return res.status(404).json({ message: 'Job not found' });
        res.json(job);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// DELETE /jobs/:id
const deleteJob = async (req, res) => {
    try {
        const job = await Job.findByIdAndDelete(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found' });
        res.json({ message: 'Job deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = { getJobs, getJobById, createJob, updateJob, deleteJob };
