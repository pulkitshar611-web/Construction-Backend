const express = require('express');
const router = express.Router();
const {
    createCorrectionRequest,
    getCorrectionRequests,
    updateCorrectionRequest
} = require('../controllers/correctionController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
    .post(createCorrectionRequest)
    .get(getCorrectionRequests);

router.route('/:id')
    .patch(updateCorrectionRequest);

module.exports = router;
