const express = require('express');
const router = express.Router();
const { getProjectChat, getPrivateChat, sendMessage } = require('../controllers/chatController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/:projectId', getProjectChat);
router.get('/private/:userId', getPrivateChat);
router.post('/', sendMessage);

module.exports = router;
