const Equipment = require('../models/Equipment');
const Job = require('../models/Job');

// @desc    Get all equipment for the company
// @route   GET /api/equipment
// @access  Private
const getEquipment = async (req, res, next) => {
    try {
        const equipment = await Equipment.find({ companyId: req.user.companyId })
            .populate('assignedJob', 'name status');
        res.json(equipment);
    } catch (error) {
        next(error);
    }
};

// @desc    Create new equipment
// @route   POST /api/equipment
// @access  Private
const createEquipment = async (req, res, next) => {
    try {
        const equipment = await Equipment.create({
            ...req.body,
            companyId: req.user.companyId
        });
        res.status(201).json(equipment);
    } catch (error) {
        next(error);
    }
};

// @desc    Update equipment
// @route   PATCH /api/equipment/:id
// @access  Private
const updateEquipment = async (req, res, next) => {
    try {
        const equipment = await Equipment.findById(req.params.id);
        if (!equipment || equipment.companyId.toString() !== req.user.companyId.toString()) {
            res.status(404);
            throw new Error('Equipment not found');
        }

        const updated = await Equipment.findByIdAndUpdate(req.params.id, req.body, { new: true })
            .populate('assignedJob', 'name status');
        res.json(updated);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete equipment
// @route   DELETE /api/equipment/:id
// @access  Private
const deleteEquipment = async (req, res, next) => {
    try {
        const equipment = await Equipment.findById(req.params.id);
        if (!equipment || equipment.companyId.toString() !== req.user.companyId.toString()) {
            res.status(404);
            throw new Error('Equipment not found');
        }
        await Equipment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Equipment removed' });
    } catch (error) {
        next(error);
    }
};

// @desc    Assign equipment to job
// @route   POST /api/equipment/:id/assign
// @access  Private
const assignEquipment = async (req, res, next) => {
    try {
        const { jobId } = req.body;
        const equipment = await Equipment.findById(req.params.id);

        if (!equipment || equipment.companyId.toString() !== req.user.companyId.toString()) {
            res.status(404);
            throw new Error('Equipment not found');
        }

        equipment.assignedJob = jobId;
        equipment.assignedDate = new Date();
        equipment.status = 'operational';

        await equipment.save();
        const populated = await Equipment.findById(equipment._id).populate('assignedJob', 'name status');
        res.json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc    Return equipment from job
// @route   POST /api/equipment/:id/return
// @access  Private
const returnEquipment = async (req, res, next) => {
    try {
        const equipment = await Equipment.findById(req.params.id);

        if (!equipment || equipment.companyId.toString() !== req.user.companyId.toString()) {
            res.status(404);
            throw new Error('Equipment not found');
        }

        equipment.assignedJob = null;
        equipment.assignedDate = null;
        equipment.status = 'idle';

        await equipment.save();
        res.json(equipment);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getEquipment,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    assignEquipment,
    returnEquipment
};
