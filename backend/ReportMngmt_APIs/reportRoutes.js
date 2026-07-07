const express = require('express');
const router = express.Router();
const reportController = require('./reportController');

const { authenticateToken, authorizeRole } = require('../UserMngmt_APIs/authMiddleware');

router.use(authenticateToken);
router.use(authorizeRole(['Admin']));

router.get('/', reportController.getReports);
router.get('/:id', reportController.getReportDetails);
router.post('/', reportController.generateReport);
router.delete('/:id', reportController.deleteReport);

module.exports = router;
