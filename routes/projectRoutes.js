const express = require('express');
const router = express.Router();
const {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    getProjectMembers
} = require('../controllers/projectController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect); // All routes protected

router.get('/', getProjects);
router.get('/:id', getProjectById);
router.get('/:id/members', getProjectMembers);
router.post('/', authorize('SUPER_ADMIN', 'COMPANY_OWNER'), createProject);
router.post('/:id/assign-pm', authorize('SUPER_ADMIN', 'COMPANY_OWNER'), updateProject); // Reuse updateProject for now or create specific controller
router.patch('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), updateProject);
router.delete('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER'), deleteProject);

module.exports = router;
