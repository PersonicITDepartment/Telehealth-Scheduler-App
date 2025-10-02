const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth');

// Public routes
router.post('/register', protect, authController.register);
router.post('/login', authController.login);
router.get('/all',protect, authController.getAllUsers);

// Protected route
router.get('/profile', protect, authController.getProfile);

module.exports = router;
