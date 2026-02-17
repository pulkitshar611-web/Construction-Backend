const express = require('express');
const router = express.Router();
const { clockIn, clockOut, getTimeLogs, updateTimeLog } = require('../controllers/timeLogController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', getTimeLogs);
router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.patch('/:id', updateTimeLog);

module.exports = router;
