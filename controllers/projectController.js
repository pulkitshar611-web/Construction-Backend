const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');

// @desc    Get projects for the company
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res, next) => {
    try {
        // Multi-tenant check: Filter by companyId
        const query = { companyId: req.user.companyId };

        // Super Admin can see all projects
        if (req.user.role === 'SUPER_ADMIN') {
            delete query.companyId;
        }

        // Clients can only see their own projects
        if (req.user.role === 'CLIENT') {
            query.clientId = req.user._id;
        }

        const projects = await Project.find(query).populate('clientId', 'fullName email').populate('createdBy', 'fullName');
        res.json(projects);
    } catch (error) {
        next(error);
    }
};

// @desc    Get project by ID
// @route   GET /api/projects/:id
// @access  Private
const getProjectById = async (req, res, next) => {
    try {
        const project = await Project.findById(req.params.id).populate('clientId', 'fullName email').populate('createdBy', 'fullName');

        if (!project) {
            res.status(404);
            throw new Error('Project not found');
        }

        // Multi-tenant authorization check
        if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId.toString() !== project.companyId.toString()) {
            res.status(403);
            throw new Error('Not authorized to access this project');
        }

        res.json(project);
    } catch (error) {
        next(error);
    }
};

// @desc    Create a new project
// @route   POST /api/projects
// @access  Private (PM, COMPANY_OWNER, SUPER_ADMIN)
const createProject = async (req, res, next) => {
    try {
        const { name, clientId, startDate, endDate, budget, location, geofenceRadius, image } = req.body;

        const project = await Project.create({
            companyId: req.user.companyId,
            name,
            clientId,
            startDate,
            endDate,
            budget,
            location,
            geofenceRadius,
            image,
            createdBy: req.user._id
        });

        res.status(201).json(project);
    } catch (error) {
        next(error);
    }
};

// @desc    Update project
// @route   PATCH /api/projects/:id
// @access  Private (PM, COMPANY_OWNER, SUPER_ADMIN)
const updateProject = async (req, res, next) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            res.status(404);
            throw new Error('Project not found');
        }

        // Multi-tenant authorization check
        if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId.toString() !== project.companyId.toString()) {
            res.status(403);
            throw new Error('Not authorized to update this project');
        }

        const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.json(updatedProject);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private (COMPANY_OWNER, SUPER_ADMIN)
const deleteProject = async (req, res, next) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            res.status(404);
            throw new Error('Project not found');
        }

        // Multi-tenant authorization check
        if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId.toString() !== project.companyId.toString()) {
            res.status(403);
            throw new Error('Not authorized to delete this project');
        }

        await Project.findByIdAndDelete(req.params.id);
        res.json({ message: 'Project removed' });
    } catch (error) {
        next(error);
    }
};

// @desc    Get project members (Team members working on the project)
// @route   GET /api/projects/:id/members
// @access  Private
const getProjectMembers = async (req, res, next) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            res.status(404);
            throw new Error('Project not found');
        }

        // Multi-tenant authorization check
        if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId.toString() !== project.companyId.toString()) {
            res.status(403);
            throw new Error('Not authorized to access this project');
        }

        // Find all users assigned to tasks in this project
        const tasks = await Task.find({ projectId: req.params.id }).select('assignedTo');
        const assignedUserIds = [...new Set(tasks.flatMap(t => t.assignedTo.map(id => id.toString())))];

        // Include project creator and company owners/PMs might also be relevant
        // For now, let's get all staff who are assigned to tasks + the creator
        if (project.createdBy) {
            assignedUserIds.push(project.createdBy.toString());
        }

        const members = await User.find({
            _id: { $in: assignedUserIds },
            role: { $ne: 'CLIENT' } // Only staff members, client already knows themselves
        }).select('fullName email role phone status');

        res.json(members);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    getProjectMembers
};
