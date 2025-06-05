const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('./auth.routes');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');

// Get notifications for current user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { read, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {
      'recipients.user': req.session.userId,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    };
    
    if (read !== undefined) {
      query['recipients.read'] = read === 'true';
    }
    
    // Get notifications
    const notifications = await Notification.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) },
      { $lookup: {
        from: 'users',
        localField: 'sender',
        foreignField: '_id',
        as: 'senderInfo'
      }},
      { $unwind: { path: '$senderInfo', preserveNullAndEmptyArrays: true } },
      { $project: {
        _id: 1,
        title: 1,
        message: 1,
        type: 1,
        link: 1,
        isGlobal: 1,
        createdAt: 1,
        sender: {
          _id: '$senderInfo._id',
          name: '$senderInfo.name',
          email: '$senderInfo.email'
        },
        read: {
          $filter: {
            input: '$recipients',
            as: 'recipient',
            cond: { $eq: ['$$recipient.user', req.session.userId] }
          }
        }
      }},
      { $unwind: { path: '$read', preserveNullAndEmptyArrays: true } }
    ]);
    
    // Get total count
    const total = await Notification.countDocuments(query);
    
    return res.status(200).json({
      notifications,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting notifications', 
      error: error.message 
    });
  }
});

// Get unread notification count
router.get('/unread-count', isAuthenticated, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      'recipients.user': req.session.userId,
      'recipients.read': false,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });
    
    return res.status(200).json({ count });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting unread notification count', 
      error: error.message 
    });
  }
});

// Mark notification as read
router.put('/:id/read', isAuthenticated, async (req, res) => {
  try {
    const result = await Notification.markAsRead(req.params.id, req.session.userId);
    
    if (result.nModified === 0) {
      return res.status(404).json({ 
        message: 'Notification not found or already read' 
      });
    }
    
    return res.status(200).json({
      message: 'Notification marked as read'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error marking notification as read', 
      error: error.message 
    });
  }
});

// Mark all notifications as read
router.put('/read-all', isAuthenticated, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { 
        'recipients.user': req.session.userId,
        'recipients.read': false
      },
      {
        $set: {
          'recipients.$.read': true,
          'recipients.$.readAt': new Date()
        }
      }
    );
    
    return res.status(200).json({
      message: 'All notifications marked as read',
      count: result.nModified
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error marking all notifications as read', 
      error: error.message 
    });
  }
});

// Create a notification (admin only)
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { title, message, type, recipients, isGlobal, link, expiresAt } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ 
        message: 'Title and message are required' 
      });
    }
    
    // Create notification
    const notification = new Notification({
      title,
      message,
      type: type || 'info',
      sender: req.session.userId,
      isGlobal: isGlobal || false,
      link,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    });
    
    // Add recipients
    if (isGlobal) {
      // For global notifications, add all active users
      const users = await User.find({ isActive: true });
      notification.recipients = users.map(user => ({
        user: user._id,
        read: false
      }));
    } else if (recipients && Array.isArray(recipients) && recipients.length > 0) {
      // For targeted notifications, add specified recipients
      notification.recipients = recipients.map(userId => ({
        user: userId,
        read: false
      }));
    } else {
      return res.status(400).json({ 
        message: 'Recipients are required for non-global notifications' 
      });
    }
    
    await notification.save();
    
    return res.status(201).json({
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error creating notification', 
      error: error.message 
    });
  }
});

// Delete a notification (admin only)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Find notification
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    // Delete notification
    await notification.remove();
    
    return res.status(200).json({
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error deleting notification', 
      error: error.message 
    });
  }
});

// Get all notifications (admin only)
router.get('/admin/all', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { type, global, sort, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    if (type) {
      query.type = type;
    }
    if (global !== undefined) {
      query.isGlobal = global === 'true';
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'title') {
      sortOption = { title: 1 };
    } else if (sort === 'type') {
      sortOption = { type: 1 };
    }
    
    // Get notifications
    const notifications = await Notification.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sender', 'name email');
    
    // Get total count
    const total = await Notification.countDocuments(query);
    
    return res.status(200).json({
      notifications,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting notifications', 
      error: error.message 
    });
  }
});

module.exports = router;
