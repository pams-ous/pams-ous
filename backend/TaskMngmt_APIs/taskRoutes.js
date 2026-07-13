const express = require('express');
const router = express.Router();
const taskController = require('./taskController');
const templateController = require('./templateController');

// Import authentication guards
const { authenticateToken, authorizeRole } = require('../UserMngmt_APIs/authMiddleware');

// All task routes require a valid logged-in user session token
router.use(authenticateToken);

// --- Template routes (must come BEFORE /:id to avoid matching "templates" as an id) ---
router.get('/templates', templateController.getTemplates);
router.post('/templates', authorizeRole(['Admin', 'Chief', 'SUPERADMIN']), templateController.createTemplate);
router.put('/templates/:id', authorizeRole(['Admin', 'Chief', 'SUPERADMIN']), templateController.updateTemplate);
router.delete('/templates/:id', authorizeRole(['Admin', 'Chief', 'SUPERADMIN']), templateController.deleteTemplate);
router.get('/templates/:id/next-counter', templateController.getNextCounter);

// --- Task routes ---
router.get('/', taskController.getTasks); // Everyone authenticated can read tasks
router.get('/me', taskController.getMyTasks);
router.post('/', authorizeRole(['Admin', 'Chief']), taskController.createTask); // Only management can create tasks
router.put('/:id', taskController.updateTask); // Checked internally inside controller for precise multi-role behavior
router.delete('/:id', authorizeRole(['Admin', 'Chief']), taskController.deleteTask); // Stop general users from wiping data
router.post('/updates', taskController.logTaskUpdate);
router.get('/:id', taskController.getTaskDetails);

module.exports = router;