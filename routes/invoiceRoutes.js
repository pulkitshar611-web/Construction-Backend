const express = require('express');
const router = express.Router();
const { getInvoices, createInvoice, updateInvoice } = require('../controllers/invoiceController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', getInvoices);
router.post('/', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), createInvoice);
router.patch('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), updateInvoice);

module.exports = router;
