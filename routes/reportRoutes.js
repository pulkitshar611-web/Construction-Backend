const express = require('express');
const router = express.Router();
const { getProjectReport, getCompanyReport, getDashboardStats } = require('../controllers/reportController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/stats', getDashboardStats);
router.get('/company', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), getCompanyReport);
router.get('/project/:projectId', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), getProjectReport);

module.exports = router;
