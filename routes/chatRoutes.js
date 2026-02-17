const express = require('express');
const router = express.Router();
const { getProjectChat, sendMessage } = require('../controllers/chatController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/:projectId', getProjectChat);
router.post('/', sendMessage);

module.exports = router;
