const express = require('express');
const router = express.Router();
const { getRoles, updateRolePermissions, getMyPermissions } = require('../controllers/roleController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/my-permissions', getMyPermissions);

// Only COMPANY_OWNER and SUPER_ADMIN can view/manage roles
router.get('/', authorize('COMPANY_OWNER', 'SUPER_ADMIN'), getRoles);
router.put('/:role', authorize('COMPANY_OWNER', 'SUPER_ADMIN'), updateRolePermissions);

module.exports = router;
