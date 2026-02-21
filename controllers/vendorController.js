const Vendor = require('../models/Vendor');

exports.createVendor = async (req, res) => {
    try {
        const vendor = new Vendor({
            ...req.body,
            companyId: req.user.companyId || req.user.company?._id
        });
        await vendor.save();
        res.status(201).json(vendor);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getVendors = async (req, res) => {
    try {
        const companyId = req.user.companyId || req.user.company?._id;
        const vendors = await Vendor.find({ companyId });
        res.json(vendors);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteVendor = async (req, res) => {
    try {
        await Vendor.findByIdAndDelete(req.params.id);
        res.json({ message: 'Vendor deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
