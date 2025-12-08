const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect, credentialDecryption } = require('../middlewares/auth');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const { getFullForm } = require('../controllers/privilliges.controller');
const { startSSO, ssoCallback } = require('../controllers/sso.controller');
const { setupAuthenticatorMFA, verifyAuthenticatorOTP } = require('../controllers/mfa.controller');
// const { startSSO, mockProvider, ssoCallback } = require('../controllers/test.sso.controller');

const PUBLIC_KEY_PATH = path.join(__dirname, '../keys/rsa_public.pem');


// Public routes
router.post('/register',protect,  authController.register);
router.post('/login',credentialDecryption, authController.login);
// router.post("/forgot-password", authController.forgotPassword);
// router.post("/reset-password/:token", authController.resetPassword);
// router.post("/verify-reset-token/:token", authController.verifyResetToken)

//  2 Factor Authentication
// router.post("/enable-2fa/:id",protect, setupAuthenticatorMFA)
// router.post("/verify-otp/:id", verifyAuthenticatorOTP)




// /api/auth/sso
router.get("/sso", startSSO);

// /api/auth/mock-provider
// router.get("/mock-provider", mockProvider);
// /api/auth/sso/callback
router.get("/sso/callback", ssoCallback);





router.get('/all',protect, authController.getAllUsers);
router.get('/pubkey', (req, res) => {
  try {
    const pubKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    // Send as plain text
    res.setHeader('Content-Type', 'text/plain');
    res.send(pubKey);
  } catch (err) {
    console.error('Error reading public key:', err);
    res.status(500).send('Could not load public key');
  }
});
// Protected route


router.get('/profile', protect, authController.getProfile);
router.get('/settings', protect, authController.getSettings);








// temporary storage (better to use DB in real project)
const otpStore = {}; // { email: { otp: '123456', expires: '...' } }


router.post("/send-otp",async(req,res)=>{
    try {
       
        return res.status(200).json(await authController.optSend(req,res))
    } catch (error) {
        res.status(501).json(error)
    }
} );
router.post("/verify-otp",authController.verifyOtp );



module.exports = router;
