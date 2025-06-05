const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('./auth.routes');
const CallerId = require('../models/callerId.model');

// Get all caller IDs for current user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const callerIds = await CallerId.find({ user: req.session.userId });
    return res.status(200).json({ callerIds });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting caller IDs', 
      error: error.message 
    });
  }
});

// Get a specific caller ID
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const callerId = await CallerId.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!callerId) {
      return res.status(404).json({ message: 'Caller ID not found' });
    }
    
    return res.status(200).json({ callerId });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting caller ID', 
      error: error.message 
    });
  }
});

// Add a new caller ID
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { phoneNumber, description } = req.body;
    
    // Check if caller ID already exists
    const existingCallerId = await CallerId.findOne({ 
      phoneNumber,
      user: req.session.userId
    });
    
    if (existingCallerId) {
      return res.status(400).json({ 
        message: 'Caller ID already exists for this user' 
      });
    }
    
    // Create new caller ID
    const callerId = new CallerId({
      phoneNumber,
      description,
      user: req.session.userId
    });
    
    // Generate verification code
    const verificationCode = callerId.generateVerificationCode();
    
    await callerId.save();
    
    // In a real application, you would send the verification code to the phone number
    // For this example, we'll just return it in the response
    
    return res.status(201).json({
      message: 'Caller ID added successfully',
      callerId,
      verificationCode
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error adding caller ID', 
      error: error.message 
    });
  }
});

// Verify a caller ID
router.post('/:id/verify', isAuthenticated, async (req, res) => {
  try {
    const { verificationCode } = req.body;
    
    // Find caller ID
    const callerId = await CallerId.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!callerId) {
      return res.status(404).json({ message: 'Caller ID not found' });
    }
    
    // Check if already verified
    if (callerId.isVerified) {
      return res.status(400).json({ message: 'Caller ID is already verified' });
    }
    
    // Check verification code
    if (!callerId.isVerificationCodeValid(verificationCode)) {
      return res.status(400).json({ 
        message: 'Invalid or expired verification code' 
      });
    }
    
    // Mark as verified
    callerId.isVerified = true;
    callerId.verificationCode = null;
    callerId.verificationExpires = null;
    
    await callerId.save();
    
    return res.status(200).json({
      message: 'Caller ID verified successfully',
      callerId
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error verifying caller ID', 
      error: error.message 
    });
  }
});

// Update a caller ID
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { description } = req.body;
    
    // Find caller ID
    const callerId = await CallerId.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!callerId) {
      return res.status(404).json({ message: 'Caller ID not found' });
    }
    
    // Update caller ID
    if (description) callerId.description = description;
    
    await callerId.save();
    
    return res.status(200).json({
      message: 'Caller ID updated successfully',
      callerId
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating caller ID', 
      error: error.message 
    });
  }
});

// Delete a caller ID
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    // Find caller ID
    const callerId = await CallerId.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!callerId) {
      return res.status(404).json({ message: 'Caller ID not found' });
    }
    
    // Check if caller ID is used in any active campaigns
    const Campaign = require('../models/campaign.model');
    const activeCampaigns = await Campaign.countDocuments({
      callerId: callerId._id,
      status: 'active'
    });
    
    if (activeCampaigns > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete caller ID used in active campaigns' 
      });
    }
    
    // Delete caller ID
    await callerId.remove();
    
    return res.status(200).json({
      message: 'Caller ID deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error deleting caller ID', 
      error: error.message 
    });
  }
});

// Resend verification code
router.post('/:id/resend-verification', isAuthenticated, async (req, res) => {
  try {
    // Find caller ID
    const callerId = await CallerId.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!callerId) {
      return res.status(404).json({ message: 'Caller ID not found' });
    }
    
    // Check if already verified
    if (callerId.isVerified) {
      return res.status(400).json({ message: 'Caller ID is already verified' });
    }
    
    // Generate new verification code
    const verificationCode = callerId.generateVerificationCode();
    
    await callerId.save();
    
    // In a real application, you would send the verification code to the phone number
    // For this example, we'll just return it in the response
    
    return res.status(200).json({
      message: 'Verification code resent successfully',
      verificationCode
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error resending verification code', 
      error: error.message 
    });
  }
});

// Get all caller IDs (admin only)
router.get('/admin/all', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { sort, limit = 10, page = 1, search } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    if (search) {
      query = {
        $or: [
          { phoneNumber: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'phoneNumber') {
      sortOption = { phoneNumber: 1 };
    } else if (sort === 'verified') {
      sortOption = { isVerified: -1 };
    }
    
    // Get caller IDs
    const callerIds = await CallerId.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'name email');
    
    // Get total count
    const total = await CallerId.countDocuments(query);
    
    return res.status(200).json({
      callerIds,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting caller IDs', 
      error: error.message 
    });
  }
});

module.exports = router;
