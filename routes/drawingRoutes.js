const express = require('express');
const router = express.Router();
const { getDrawings, createDrawing, addDrawingVersion, deleteDrawing } = require('../controllers/drawingController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', getDrawings);
router.post('/', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM', 'ENGINEER'), createDrawing);
router.post('/:id/versions', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM', 'ENGINEER'), addDrawingVersion);
router.delete('/:id', authorize('SUPER_ADMIN', 'COMPANY_OWNER', 'PM'), deleteDrawing);

module.exports = router;
