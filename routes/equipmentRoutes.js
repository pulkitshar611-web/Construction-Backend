const express = require('express');
const router = express.Router();
const {
    getEquipment,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    assignEquipment,
    returnEquipment,
    uploadEquipmentImage
} = require('../controllers/equipmentController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.use(protect);

router.route('/')
    .get(getEquipment)
    .post(createEquipment);

router.route('/:id')
    .patch(updateEquipment)
    .delete(deleteEquipment);

router.post('/:id/assign', assignEquipment);
router.post('/:id/return', returnEquipment);
router.post('/:id/upload-image', upload.single('image'), uploadEquipmentImage);

module.exports = router;

