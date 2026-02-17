const Drawing = require('../models/Drawing');

// @desc    Get all drawings
// @route   GET /api/drawings
// @access  Private
const getDrawings = async (req, res, next) => {
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
                return res.status(403).json({ message: 'Not authorized to access this project drawings' });
            }
            query.projectId = req.query.projectId;
        }

        const drawings = await Drawing.find(query).populate('projectId', 'name');
        res.json(drawings);
    } catch (error) {
        next(error);
    }
};

// @desc    Create new drawing
// @route   POST /api/drawings
// @access  Private
const createDrawing = async (req, res, next) => {
    try {
        const { projectId, title, drawingNumber, category, fileUrl } = req.body;

        const drawing = await Drawing.create({
            companyId: req.user.companyId,
            projectId,
            title,
            drawingNumber,
            category,
            versions: [{
                versionNumber: 1,
                fileUrl,
                uploadedBy: req.user._id,
                description: 'Initial Version'
            }]
        });

        res.status(201).json(drawing);
    } catch (error) {
        next(error);
    }
};

// @desc    Add new version to drawing
// @route   POST /api/drawings/:id/versions
// @access  Private
const addDrawingVersion = async (req, res, next) => {
    try {
        const { fileUrl, description } = req.body;
        const drawing = await Drawing.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!drawing) {
            res.status(404);
            throw new Error('Drawing not found');
        }

        const newVersionNumber = drawing.versions.length + 1;
        drawing.versions.push({
            versionNumber: newVersionNumber,
            fileUrl,
            uploadedBy: req.user._id,
            description
        });
        drawing.currentVersion = newVersionNumber;

        await drawing.save();
        res.status(201).json(drawing);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete drawing
// @route   DELETE /api/drawings/:id
// @access  Private
const deleteDrawing = async (req, res, next) => {
    try {
        const drawing = await Drawing.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!drawing) {
            res.status(404);
            throw new Error('Drawing not found');
        }

        await Drawing.findByIdAndDelete(req.params.id);
        res.json({ message: 'Drawing removed' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDrawings,
    createDrawing,
    addDrawingVersion,
    deleteDrawing
};
