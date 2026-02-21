const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.post('/', vendorController.createVendor);
router.get('/', vendorController.getVendors);
router.delete('/:id', vendorController.deleteVendor);

module.exports = router;
