const express = require('express');
const router = express.Router();
const {
    getTasks,
    getMyTasks,
    createTask,
    updateTask,
    deleteTask
} = require('../controllers/taskController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', getTasks);
router.get('/my-tasks', getMyTasks);
router.post('/', createTask); // Any team member can create tasks usually, or restrict to PM/Foreman
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

module.exports = router;
