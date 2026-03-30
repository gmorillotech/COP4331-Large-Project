const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User =require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const tokenService = require('../createJWT.js');

const router = express.Router();

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// 1. POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, login, password } = req.body;
        if (!firstName || !lastName || !login || !password) {
            return res.status(400).json({ error: 'Please provide all required fields.' });
        }
        const existingUser = await User.findOne({ login });
        if (existingUser) {
            return res.status(409).json({ error: 'An account with that email already exists.' });
        }
        
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const newUser = new User({ firstName, lastName, login, password, verificationToken });
        await newUser.save();

        const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        await transporter.sendMail({
            to: login,
            from: `Meta Location <${process.env.EMAIL_USER}>`,
            subject: 'Verify Your Account',
            html: `<p>Welcome! Please click this link to verify your account: <a href="${verificationLink}">${verificationLink}</a></p>`,
        });

        res.status(201).json({ message: 'Registration successful. Please check your email to verify.' });
   } catch (error) {
    // This will make the error very obvious in your terminal
    console.error("--- REGISTRATION FAILED ---");
    console.error(error); 
    console.error("---------------------------");

    // This sends the specific error message back to Postman
    res.status(500).json({ 
        error: "Server error during registration.",
        details: error.message 
    });
}
});

// 2. POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        const user = await User.findOne({ login });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        if (!user.isVerified) {
            return res.status(403).json({ error: 'Please verify your email before logging in.' });
        }
        
        const token = tokenService.createToken(user.firstName, user.lastName, user._id);
        res.status(200).json({ accessToken: token.accessToken });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// 3. POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findOne({ verificationToken: token });
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired verification token.' });
        }
        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();
        res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
    } catch (error) {
        res.status(500).json({ error: 'Server error during email verification.' });
    }
});

// 4. POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { login } = req.body;
        const user = await User.findOne({ login });
        if (!user) {
            // Still send a success message to prevent user enumeration
            return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        await transporter.sendMail({
            to: user.login,
            from: `Meta Location <${process.env.EMAIL_USER}>`,
            subject: 'Password Reset Request',
            html: `<p>You requested a password reset. Click this link to continue: <a href="${resetLink}">${resetLink}</a>. This link will expire in one hour.</p>`,
        });

        res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// 5. POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
        }

        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.status(200).json({ message: 'Password has been successfully reset.' });
    } catch (error) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// 6. GET /api/auth/profile
router.get('/profile', protect, (req, res) => {
    res.status(200).json(req.user);
});

// 7. PUT /api/auth/profile
router.put('/profile', protect, async (req, res) => {
    try {
        const { firstName, lastName } = req.body;
        const user = await User.findById(req.user._id);

        if (user) {
            user.firstName = firstName || user.firstName;
            user.lastName = lastName || user.lastName;
            const updatedUser = await user.save();
            res.status(200).json({
                _id: updatedUser._id,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                login: updatedUser.login,
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error while updating profile.' });
    }
});

module.exports = router;