const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

router.post('/generate/:projectId', orderController.generateBookPDF);
router.post('/select', orderController.selectTemplateAndOrder);
router.get('/:orderId', orderController.getOrderStatus);

module.exports = router;