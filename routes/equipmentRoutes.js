const express = require('express');
const router = express.Router();
const {
    getEquipment,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    assignEquipment,
    returnEquipment
} = require('../controllers/equipmentController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.route('/')
    .get(getEquipment)
    .post(createEquipment);

router.route('/:id')
    .patch(updateEquipment)
    .delete(deleteEquipment);

router.post('/:id/assign', assignEquipment);
router.post('/:id/return', returnEquipment);

module.exports = router;
