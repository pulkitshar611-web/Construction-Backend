const PurchaseOrder = require('../models/PurchaseOrder');

// @desc    Get all purchase orders
// @route   GET /api/purchase-orders
// @access  Private
const getPurchaseOrders = async (req, res, next) => {
    try {
        const query = { companyId: req.user.companyId };
        if (req.query.projectId) query.projectId = req.query.projectId;

        const pos = await PurchaseOrder.find(query).populate('projectId', 'name').populate('createdBy', 'fullName');
        res.json(pos);
    } catch (error) {
        next(error);
    }
};

// @desc    Create new purchase order
// @route   POST /api/purchase-orders
// @access  Private (PM, Owners)
const createPurchaseOrder = async (req, res, next) => {
    try {
        const po = await PurchaseOrder.create({
            ...req.body,
            companyId: req.user.companyId,
            createdBy: req.user._id
        });
        res.status(201).json(po);
    } catch (error) {
        next(error);
    }
};

// @desc    Update PO status
// @route   PATCH /api/purchase-orders/:id
// @access  Private
const updatePurchaseOrder = async (req, res, next) => {
    try {
        const po = await PurchaseOrder.findOne({ _id: req.params.id, companyId: req.user.companyId });

        if (!po) {
            res.status(404);
            throw new Error('Purchase order not found');
        }

        const updatedPo = await PurchaseOrder.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.json(updatedPo);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPurchaseOrders,
    createPurchaseOrder,
    updatePurchaseOrder
};
