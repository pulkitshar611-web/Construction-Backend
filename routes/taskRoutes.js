const express = require('express');
const router = express.Router();
const {
    getTasks,
    getMyTasks,
    getProjectTasks,
    createTask,
    assignTask,
    updateTask,
    deleteTask
} = require('../controllers/taskController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);

// Must be before /:id to avoid route conflict
router.get('/my-tasks', getMyTasks);
router.get('/project/:projectId', getProjectTasks);

router.get('/', getTasks);
router.post('/', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM', 'FOREMAN'), createTask);

router.put('/:id/assign', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM', 'FOREMAN'), assignTask);
router.patch('/:id', updateTask); // All roles — internal checks in controller
router.delete('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), deleteTask);

module.exports = router;
