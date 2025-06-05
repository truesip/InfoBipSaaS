const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isAuthenticated, isAdmin } = require('./auth.routes');
const Billing = require('../models/billing.model');
const User = require('../models/user.model');
const Setting = require('../models/setting.model');

// Get billing history for current user
router.get('/history', isAuthenticated, async (req, res) => {
  try {
    const { type, sort, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = { user: req.session.userId };
    if (type) {
      query.type = type;
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'amount') {
      sortOption = { amount: -1 };
    } else if (sort === 'status') {
      sortOption = { status: 1 };
    }
    
    // Get billing records
    const billingRecords = await Billing.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('campaign', 'name');
    
    // Get total count
    const total = await Billing.countDocuments(query);
    
    return res.status(200).json({
      billingRecords,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting billing history', 
      error: error.message 
    });
  }
});

// Get a specific billing record
router.get('/record/:id', isAuthenticated, async (req, res) => {
  try {
    const billingRecord = await Billing.findOne({
      _id: req.params.id,
      user: req.session.userId
    }).populate('campaign', 'name');
    
    if (!billingRecord) {
      return res.status(404).json({ message: 'Billing record not found' });
    }
    
    return res.status(200).json({ billingRecord });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting billing record', 
      error: error.message 
    });
  }
});

// Add credits to user's account
router.post('/add-credits', isAuthenticated, async (req, res) => {
  try {
    const { amount, paymentMethod, paymentDetails } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid credit amount' });
    }
    
    // Find user
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Create billing record
    const billing = new Billing({
      user: user._id,
      type: 'credit',
      amount,
      credits: amount,
      description: 'Credits added by user',
      paymentMethod: paymentMethod || 'credit_card',
      paymentDetails,
      status: 'pending' // In a real app, this would be updated after payment processing
    });
    
    await billing.save();
    
    // In a real application, you would integrate with a payment gateway here
    // For this example, we'll just simulate a successful payment
    
    // Update billing record status
    billing.status = 'completed';
    await billing.save();
    
    // Add credits to user
    user.credits += amount;
    await user.save();
    
    return res.status(200).json({
      message: 'Credits added successfully',
      billing,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        credits: user.credits
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error adding credits', 
      error: error.message 
    });
  }
});

// Get call history for current user
router.get('/call-history', isAuthenticated, async (req, res) => {
  try {
    const { campaignId, status, sort, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = { user: req.session.userId };
    if (campaignId) {
      query.campaign = campaignId;
    }
    if (status) {
      query.status = status;
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'amount') {
      sortOption = { amount: -1 };
    } else if (sort === 'campaign') {
      sortOption = { campaign: 1 };
    }
    
    // Get call history
    const Call = require('../models/call.model');
    const calls = await Call.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('campaign', 'name')
      .populate('callerId', 'phoneNumber');
    
    // Get total count
    const total = await Call.countDocuments(query);
    
    return res.status(200).json({
      calls,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting call history', 
      error: error.message 
    });
  }
});

// Get billing summary for current user
router.get('/summary', isAuthenticated, async (req, res) => {
  try {
    const { period } = req.query;
    let startDate, endDate;
    
    // Determine date range based on period
    const now = new Date();
    if (period === 'week') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      // Default to all time
      startDate = new Date(0);
    }
    endDate = now;
    
    // Get billing summary
    const summary = await Billing.aggregate([
      { 
        $match: { 
          user: mongoose.Types.ObjectId(req.session.userId),
          createdAt: { $gte: startDate, $lte: endDate }
        } 
      },
      { 
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalCredits: { $sum: '$credits' }
        }
      }
    ]);
    
    // Format summary
    const formattedSummary = {
      credits: 0,
      debits: 0,
      refunds: 0,
      net: 0
    };
    
    summary.forEach(item => {
      if (item._id === 'credit') {
        formattedSummary.credits = item.totalAmount;
      } else if (item._id === 'debit') {
        formattedSummary.debits = item.totalAmount;
      } else if (item._id === 'refund') {
        formattedSummary.refunds = item.totalAmount;
      }
    });
    
    formattedSummary.net = formattedSummary.credits - formattedSummary.debits + formattedSummary.refunds;
    
    // Get current user credits
    const user = await User.findById(req.session.userId);
    formattedSummary.currentCredits = user.credits;
    
    return res.status(200).json({ summary: formattedSummary });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting billing summary', 
      error: error.message 
    });
  }
});

// Get call rates
router.get('/rates', isAuthenticated, async (req, res) => {
  try {
    const platformRate = await Setting.getByKey('call_rate.platform') || 0.05;
    
    return res.status(200).json({
      platformRate
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting call rates', 
      error: error.message 
    });
  }
});

// Get all billing records (admin only)
router.get('/admin/all', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { userId, type, status, sort, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    if (userId) {
      query.user = userId;
    }
    if (type) {
      query.type = type;
    }
    if (status) {
      query.status = status;
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'amount') {
      sortOption = { amount: -1 };
    } else if (sort === 'user') {
      sortOption = { user: 1 };
    }
    
    // Get billing records
    const billingRecords = await Billing.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'name email')
      .populate('campaign', 'name');
    
    // Get total count
    const total = await Billing.countDocuments(query);
    
    return res.status(200).json({
      billingRecords,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting billing records', 
      error: error.message 
    });
  }
});

// Update call rates (admin only)
router.put('/admin/rates', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { platformRate, providerRate } = req.body;
    
    if (platformRate !== undefined) {
      await Setting.setByKey('call_rate.platform', parseFloat(platformRate), req.session.userId);
    }
    
    if (providerRate !== undefined) {
      await Setting.setByKey('call_rate.provider', parseFloat(providerRate), req.session.userId);
    }
    
    return res.status(200).json({
      message: 'Call rates updated successfully',
      rates: {
        platformRate: await Setting.getByKey('call_rate.platform'),
        providerRate: await Setting.getByKey('call_rate.provider')
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating call rates', 
      error: error.message 
    });
  }
});

// Get billing statistics (admin only)
router.get('/admin/stats', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { period } = req.query;
    let startDate, endDate;
    
    // Determine date range based on period
    const now = new Date();
    if (period === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      // Default to all time
      startDate = new Date(0);
    }
    endDate = now;
    
    // Get billing statistics
    const stats = await Billing.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startDate, $lte: endDate }
        } 
      },
      { 
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalCredits: { $sum: '$credits' },
          totalProfit: { $sum: '$profit' }
        }
      }
    ]);
    
    // Format statistics
    const formattedStats = {
      credits: { count: 0, amount: 0 },
      debits: { count: 0, amount: 0 },
      refunds: { count: 0, amount: 0 },
      totalProfit: 0,
      periodStart: startDate,
      periodEnd: endDate
    };
    
    stats.forEach(item => {
      if (item._id === 'credit') {
        formattedStats.credits = { 
          count: item.count, 
          amount: item.totalAmount 
        };
      } else if (item._id === 'debit') {
        formattedStats.debits = { 
          count: item.count, 
          amount: item.totalAmount 
        };
        formattedStats.totalProfit += item.totalProfit || 0;
      } else if (item._id === 'refund') {
        formattedStats.refunds = { 
          count: item.count, 
          amount: item.totalAmount 
        };
      }
    });
    
    return res.status(200).json({ stats: formattedStats });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting billing statistics', 
      error: error.message 
    });
  }
});

module.exports = router;
