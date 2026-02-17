const express = require('express');
const router = express.Router();
const { getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder } = require('../controllers/purchaseOrderController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', getPurchaseOrders);
router.post('/', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), createPurchaseOrder);
router.patch('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), updatePurchaseOrder);

module.exports = router;
