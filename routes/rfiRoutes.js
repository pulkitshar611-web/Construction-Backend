const express = require('express');
const router = express.Router();
const {
    getRFIs, getRFIStats, getRFIById,
    createRFI, updateRFI, addComment, deleteRFI
} = require('../controllers/rfiController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/stats', getRFIStats);
router.get('/', getRFIs);
router.post('/', createRFI);
router.get('/:id', getRFIById);
router.patch('/:id', updateRFI);
router.post('/:id/comments', addComment);
router.delete('/:id', authorize('COMPANY_OWNER', 'PM', 'SUPER_ADMIN'), deleteRFI);

module.exports = router;
