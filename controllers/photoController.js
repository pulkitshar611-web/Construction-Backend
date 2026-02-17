const Photo = require('../models/Photo');
const Project = require('../models/Project');

// @desc    Get all photos
// @route   GET /api/photos
// @access  Private
const getPhotos = async (req, res, next) => {
    try {
        const query = { companyId: req.user.companyId };

        // Filter projects for clients
        if (req.user.role === 'CLIENT') {
            const clientProjects = await Project.find({ clientId: req.user._id }).select('_id');
            const projectIds = clientProjects.map(p => p._id);
            query.projectId = { $in: projectIds };
        }

        if (req.query.projectId) {
            // If projectId is provided, ensure it's one of the client's projects
            if (req.user.role === 'CLIENT') {
                const clientProjects = await Project.find({ clientId: req.user._id }).select('_id');
                const projectIds = clientProjects.map(p => p._id.toString());
                if (!projectIds.includes(req.query.projectId)) {
                    return res.status(403).json({ message: 'Not authorized to access this project photos' });
                }
            }
            query.projectId = req.query.projectId;
        }
        if (req.query.taskId) query.taskId = req.query.taskId;

        const photos = await Photo.find(query)
            .populate('projectId', 'name')
            .populate('uploadedBy', 'fullName')
            .sort({ createdAt: -1 });

        res.json(photos);
    } catch (error) {
        next(error);
    }
};

// @desc    Upload photo
// @route   POST /api/photos/upload
// @access  Private
const uploadPhoto = async (req, res, next) => {
    try {
        console.log('Upload Request Headers:', req.headers);
        console.log('Upload Request Body:', req.body);
        console.log('Upload Request File:', req.file);

        const { projectId, taskId, description } = req.body;

        // Construct imageUrl from the file saved by multer
        let imageUrl = req.body.imageUrl; // fallback for legacy or manual URLs

        if (req.file) {
            // For Cloudinary, req.file.path is already the full URL
            imageUrl = req.file.path;
        }

        if (!imageUrl) {
            res.status(400);
            throw new Error('Please upload an image file or provide an imageUrl');
        }

        const photo = await Photo.create({
            companyId: req.user.companyId,
            projectId: projectId || undefined,
            taskId: taskId || undefined,
            uploadedBy: req.user._id,
            imageUrl,
            description
        });

        res.status(201).json(photo);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete photo
// @route   DELETE /api/photos/:id
// @access  Private
const deletePhoto = async (req, res, next) => {
    try {
        const photo = await Photo.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!photo) {
            res.status(404);
            throw new Error('Photo not found');
        }

        // Ideally, delete the physical file here too
        // if (photo.imageUrl.includes('uploads/')) { ... }

        await Photo.findByIdAndDelete(req.params.id);
        res.json({ message: 'Photo removed' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPhotos,
    uploadPhoto,
    deletePhoto
};
