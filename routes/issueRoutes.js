const express = require('express');
const router = express.Router();
const { getIssues, createIssue, updateIssue, deleteIssue } = require('../controllers/issueController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', getIssues);
router.post('/', createIssue);
router.patch('/:id', updateIssue);
router.delete('/:id', deleteIssue);

module.exports = router;
