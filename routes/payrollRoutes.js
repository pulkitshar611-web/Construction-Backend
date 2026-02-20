const express = require('express');
const router = express.Router();
const { getPayrollPreview, runPayroll, getPayrollHistory } = require('../controllers/payrollController');
const { protect, checkPermission } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/preview', checkPermission('COMPANY_OWNER'), getPayrollPreview);
router.post('/run', checkPermission('COMPANY_OWNER'), runPayroll);
router.get('/history', checkPermission('COMPANY_OWNER'), getPayrollHistory);

module.exports = router;
