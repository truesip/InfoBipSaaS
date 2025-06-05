const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isAuthenticated, isAdmin } = require('./auth.routes');
const User = require('../models/user.model');
const Campaign = require('../models/campaign.model');
const Call = require('../models/call.model');
const Billing = require('../models/billing.model');
const Setting = require('../models/setting.model');

// Get admin dashboard statistics
router.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
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
    
    // Get user statistics
    const userStats = await User.aggregate([
      {
        $facet: {
          'total': [
            { $count: 'count' }
          ],
          'active': [
            { $match: { isActive: true } },
            { $count: 'count' }
          ],
          'new': [
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    // Get campaign statistics
    const campaignStats = await Campaign.aggregate([
      {
        $facet: {
          'total': [
            { $count: 'count' }
          ],
          'active': [
            { $match: { status: 'active' } },
            { $count: 'count' }
          ],
          'completed': [
            { $match: { status: 'completed' } },
            { $count: 'count' }
          ],
          'new': [
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    // Get call statistics
    const callStats = await Call.aggregate([
      {
        $facet: {
          'total': [
            { $count: 'count' }
          ],
          'answered': [
            { $match: { status: 'answered' } },
            { $count: 'count' }
          ],
          'failed': [
            { $match: { status: 'failed' } },
            { $count: 'count' }
          ],
          'busy': [
            { $match: { status: 'busy' } },
            { $count: 'count' }
          ],
          'no-answer': [
            { $match: { status: 'no-answer' } },
            { $count: 'count' }
          ],
          'in-progress': [
            { $match: { status: 'in-progress' } },
            { $count: 'count' }
          ],
          'transfer': [
            { $match: { status: 'transfer' } },
            { $count: 'count' }
          ],
          'completed': [
            { $match: { status: 'completed' } },
            { $count: 'count' }
          ],
          'new': [
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    // Get billing statistics
    const billingStats = await Billing.aggregate([
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
          totalProfit: { $sum: '$profit' }
        }
      }
    ]);
    
    // Format billing statistics
    const formattedBillingStats = {
      credits: { count: 0, amount: 0 },
      debits: { count: 0, amount: 0 },
      refunds: { count: 0, amount: 0 },
      totalProfit: 0,
      todayProfit: 0,
      allTimeProfit: 0
    };
    
    billingStats.forEach(item => {
      if (item._id === 'credit') {
        formattedBillingStats.credits = { 
          count: item.count, 
          amount: item.totalAmount 
        };
      } else if (item._id === 'debit') {
        formattedBillingStats.debits = { 
          count: item.count, 
          amount: item.totalAmount 
        };
        formattedBillingStats.totalProfit += item.totalProfit || 0;
      } else if (item._id === 'refund') {
        formattedBillingStats.refunds = { 
          count: item.count, 
          amount: item.totalAmount 
        };
      }
    });
    
    // Get today's profit
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayProfitResult = await Billing.aggregate([
      { 
        $match: { 
          createdAt: { $gte: today, $lte: now }
        } 
      },
      { 
        $group: {
          _id: null,
          totalProfit: { $sum: '$profit' }
        }
      }
    ]);
    
    if (todayProfitResult.length > 0) {
      formattedBillingStats.todayProfit = todayProfitResult[0].totalProfit || 0;
    }
    
    // Get all-time profit
    const allTimeProfitResult = await Billing.aggregate([
      { 
        $group: {
          _id: null,
          totalProfit: { $sum: '$profit' }
        }
      }
    ]);
    
    if (allTimeProfitResult.length > 0) {
      formattedBillingStats.allTimeProfit = allTimeProfitResult[0].totalProfit || 0;
    }
    
    // Get call rates
    const platformRate = await Setting.getByKey('call_rate.platform') || 0.05;
    const providerRate = await Setting.getByKey('call_rate.provider') || 0.03;
    
    // Format response
    const stats = {
      users: {
        total: userStats[0].total[0]?.count || 0,
        active: userStats[0].active[0]?.count || 0,
        new: userStats[0].new[0]?.count || 0
      },
      campaigns: {
        total: campaignStats[0].total[0]?.count || 0,
        active: campaignStats[0].active[0]?.count || 0,
        completed: campaignStats[0].completed[0]?.count || 0,
        new: campaignStats[0].new[0]?.count || 0
      },
      calls: {
        total: callStats[0].total[0]?.count || 0,
        answered: callStats[0].answered[0]?.count || 0,
        failed: callStats[0].failed[0]?.count || 0,
        busy: callStats[0].busy[0]?.count || 0,
        noAnswer: callStats[0]['no-answer'][0]?.count || 0,
        inProgress: callStats[0]['in-progress'][0]?.count || 0,
        transfer: callStats[0].transfer[0]?.count || 0,
        completed: callStats[0].completed[0]?.count || 0,
        new: callStats[0].new[0]?.count || 0
      },
      billing: formattedBillingStats,
      rates: {
        platform: platformRate,
        provider: providerRate,
        profit: platformRate - providerRate
      },
      period: {
        start: startDate,
        end: endDate
      }
    };
    
    return res.status(200).json({ stats });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting dashboard statistics', 
      error: error.message 
    });
  }
});

// Get user dashboard statistics
router.get('/user', isAuthenticated, async (req, res) => {
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
    
    // Get campaign statistics
    const campaignStats = await Campaign.aggregate([
      {
        $match: { user: mongoose.Types.ObjectId(req.session.userId) }
      },
      {
        $facet: {
          'total': [
            { $count: 'count' }
          ],
          'active': [
            { $match: { status: 'active' } },
            { $count: 'count' }
          ],
          'completed': [
            { $match: { status: 'completed' } },
            { $count: 'count' }
          ],
          'new': [
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    // Get call statistics
    const callStats = await Call.aggregate([
      {
        $match: { user: mongoose.Types.ObjectId(req.session.userId) }
      },
      {
        $facet: {
          'total': [
            { $count: 'count' }
          ],
          'answered': [
            { $match: { status: 'answered' } },
            { $count: 'count' }
          ],
          'failed': [
            { $match: { status: 'failed' } },
            { $count: 'count' }
          ],
          'busy': [
            { $match: { status: 'busy' } },
            { $count: 'count' }
          ],
          'no-answer': [
            { $match: { status: 'no-answer' } },
            { $count: 'count' }
          ],
          'in-progress': [
            { $match: { status: 'in-progress' } },
            { $count: 'count' }
          ],
          'transfer': [
            { $match: { status: 'transfer' } },
            { $count: 'count' }
          ],
          'completed': [
            { $match: { status: 'completed' } },
            { $count: 'count' }
          ],
          'new': [
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    // Get billing statistics
    const billingStats = await Billing.aggregate([
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
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    // Format billing statistics
    const formattedBillingStats = {
      credits: { count: 0, amount: 0 },
      debits: { count: 0, amount: 0 },
      refunds: { count: 0, amount: 0 }
    };
    
    billingStats.forEach(item => {
      if (item._id === 'credit') {
        formattedBillingStats.credits = { 
          count: item.count, 
          amount: item.totalAmount 
        };
      } else if (item._id === 'debit') {
        formattedBillingStats.debits = { 
          count: item.count, 
          amount: item.totalAmount 
        };
      } else if (item._id === 'refund') {
        formattedBillingStats.refunds = { 
          count: item.count, 
          amount: item.totalAmount 
        };
      }
    });
    
    // Get user credits
    const user = await User.findById(req.session.userId);
    
    // Get call rate
    const platformRate = await Setting.getByKey('call_rate.platform') || 0.05;
    
    // Format response
    const stats = {
      user: {
        credits: user.credits,
        name: user.name,
        email: user.email
      },
      campaigns: {
        total: campaignStats[0].total[0]?.count || 0,
        active: campaignStats[0].active[0]?.count || 0,
        completed: campaignStats[0].completed[0]?.count || 0,
        new: campaignStats[0].new[0]?.count || 0
      },
      calls: {
        total: callStats[0].total[0]?.count || 0,
        answered: callStats[0].answered[0]?.count || 0,
        failed: callStats[0].failed[0]?.count || 0,
        busy: callStats[0].busy[0]?.count || 0,
        noAnswer: callStats[0]['no-answer'][0]?.count || 0,
        inProgress: callStats[0]['in-progress'][0]?.count || 0,
        transfer: callStats[0].transfer[0]?.count || 0,
        completed: callStats[0].completed[0]?.count || 0,
        new: callStats[0].new[0]?.count || 0
      },
      billing: formattedBillingStats,
      rate: platformRate,
      period: {
        start: startDate,
        end: endDate
      }
    };
    
    return res.status(200).json({ stats });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting dashboard statistics', 
      error: error.message 
    });
  }
});

module.exports = router;
