const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isAuthenticated, isAdmin } = require('./auth.routes');
const User = require('../models/user.model');
const Campaign = require('../models/campaign.model');
const Call = require('../models/call.model');
const Billing = require('../models/billing.model');

// Get all users (admin only)
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { sort, limit = 10, page = 1, search } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'name') {
      sortOption = { name: 1 };
    } else if (sort === 'email') {
      sortOption = { email: 1 };
    } else if (sort === 'credits') {
      sortOption = { credits: -1 };
    }
    
    // Get users
    const users = await User.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password'); // Exclude password
    
    // Get total count
    const total = await User.countDocuments(query);
    
    return res.status(200).json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting users', 
      error: error.message 
    });
  }
});

// Get a specific user (admin or self)
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    // Check if user is admin or requesting their own profile
    if (req.params.id !== req.session.userId && !req.session.isAdmin) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting user', 
      error: error.message 
    });
  }
});

// Create a new user (admin only)
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { name, username, email, password, phoneNumber, address, role, credits } = req.body;
    
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
      role: role || 'user',
      credits: credits || 0
    });
    
    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error creating user', 
      error: error.message 
    });
  }
});

// Update a user (admin or self)
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    // Check if user is admin or updating their own profile
    const isUpdatingSelf = req.params.id === req.session.userId;
    const isAdmin = req.session.isAdmin;
    
    if (!isUpdatingSelf && !isAdmin) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const { name, email, phoneNumber, address, role, credits, isActive } = req.body;
    
    // Find user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update user fields
    if (name) user.name = name;
    if (email && isAdmin) user.email = email; // Only admin can change email
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (address) user.address = address;
    if (role && isAdmin) user.role = role; // Only admin can change role
    if (credits !== undefined && isAdmin) user.credits = credits; // Only admin can change credits
    if (isActive !== undefined && isAdmin) user.isActive = isActive; // Only admin can change active status
    
    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.status(200).json({
      message: 'User updated successfully',
      user: userResponse
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating user', 
      error: error.message 
    });
  }
});

// Delete a user (admin only)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Find user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user has active campaigns
    const activeCampaigns = await Campaign.countDocuments({
      user: user._id,
      status: 'active'
    });
    
    if (activeCampaigns > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete user with active campaigns' 
      });
    }
    
    // Delete user
    await user.remove();
    
    return res.status(200).json({
      message: 'User deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error deleting user', 
      error: error.message 
    });
  }
});

// Get user statistics
router.get('/:id/stats', isAuthenticated, async (req, res) => {
  try {
    // Check if user is admin or requesting their own stats
    if (req.params.id !== req.session.userId && !req.session.isAdmin) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const userId = req.params.id;
    
    // Get campaign statistics
    const campaignStats = await Campaign.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalContacts: { $sum: '$totalContacts' },
        processedContacts: { $sum: '$processedContacts' }
      }}
    ]);
    
    // Get call statistics
    const callStats = await Call.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDuration: { $sum: '$duration' }
      }}
    ]);
    
    // Get billing statistics
    const billingStats = await Billing.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      { $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }}
    ]);
    
    // Format statistics
    const stats = {
      campaigns: campaignStats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          totalContacts: stat.totalContacts,
          processedContacts: stat.processedContacts
        };
        return acc;
      }, {}),
      calls: callStats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          totalDuration: stat.totalDuration
        };
        return acc;
      }, {}),
      billing: billingStats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          totalAmount: stat.totalAmount
        };
        return acc;
      }, {})
    };
    
    return res.status(200).json({ stats });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting user statistics', 
      error: error.message 
    });
  }
});

// Add credits to user (admin only)
router.post('/:id/credits', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid credit amount' });
    }
    
    // Find user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add credits
    user.credits += amount;
    await user.save();
    
    // Create billing record
    const billing = new Billing({
      user: user._id,
      type: 'credit',
      amount,
      credits: amount,
      description: description || 'Credits added by admin',
      paymentMethod: 'system',
      status: 'completed'
    });
    
    await billing.save();
    
    return res.status(200).json({
      message: 'Credits added successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        credits: user.credits
      },
      billing
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error adding credits', 
      error: error.message 
    });
  }
});

module.exports = router;
