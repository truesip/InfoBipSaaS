const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/user.model');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ message: 'Unauthorized' });
};

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    if (user && user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { name, username, email, password, phoneNumber, address } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }]
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists with this email or username' 
      });
    }
    
    // Create new user
    const user = new User({
      name,
      username,
      email,
      password, // Will be hashed by the pre-save hook
      phoneNumber,
      address,
      role: 'user' // Default role
    });
    
    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.status(201).json({
      message: 'User registered successfully',
      user: userResponse
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error registering user', 
      error: error.message 
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user by username or email
    const user = await User.findOne({ 
      $or: [{ username }, { email: username }]
    });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is disabled' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Set session
    req.session.userId = user._id;
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.status(200).json({
      message: 'Login successful',
      user: userResponse
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error logging in', 
      error: error.message 
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        message: 'Error logging out', 
        error: err.message 
      });
    }
    return res.status(200).json({ message: 'Logout successful' });
  });
});

// Get current user
router.get('/me', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.status(200).json({ user: userResponse });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting user', 
      error: error.message 
    });
  }
});

// Update password
router.put('/password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Find user
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating password', 
      error: error.message 
    });
  }
});

// Export router
module.exports = router;

// Export middleware for use in other routes
module.exports.isAuthenticated = isAuthenticated;
module.exports.isAdmin = isAdmin;
