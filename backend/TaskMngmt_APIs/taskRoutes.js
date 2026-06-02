const express = require('express');
const router = express.Router();

module.exports = (db) => {
    // Initialize controller with central db pool
    const taskController = require('./taskController')(db); 

    router.get('/', taskController.getTasks);
    router.post('/', taskController.createTask);
    router.put('/:id', taskController.updateTask);
    router.delete('/:id', taskController.deleteTask);

    return router;
};