const express = require('express');
const router = express.Router();
const {
    getTasks,
    getMyTasks,
    createTask,
    updateTask,
    deleteTask
} = require('../controllers/taskController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/', getTasks);
router.get('/my-tasks', getMyTasks);
router.post('/', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM', 'FOREMAN'), createTask);
router.patch('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM', 'FOREMAN'), updateTask);
router.delete('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), deleteTask);

module.exports = router;
