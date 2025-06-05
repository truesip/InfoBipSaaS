const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { isAuthenticated, isAdmin } = require('./auth.routes');
const Campaign = require('../models/campaign.model');
const CallerId = require('../models/callerId.model');
const File = require('../models/file.model');
const Call = require('../models/call.model');
const Blocklist = require('../models/blocklist.model');
const Setting = require('../models/setting.model');
const User = require('../models/user.model');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/contacts');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Create a new campaign
router.post('/', isAuthenticated, upload.single('contactsFile'), async (req, res) => {
  try {
    const { name, callerIdId, messageScript, transferKey } = req.body;
    
    // Validate caller ID
    const callerId = await CallerId.findOne({ 
      _id: callerIdId,
      user: req.session.userId,
      isVerified: true,
      isActive: true
    });
    
    if (!callerId) {
      return res.status(400).json({ message: 'Invalid or unverified caller ID' });
    }
    
    // Check if message script contains blocked words
    const blockedWordsCheck = await Blocklist.containsBlockedWords(messageScript);
    if (blockedWordsCheck.contains) {
      return res.status(400).json({ 
        message: 'Message script contains blocked words',
        blockedWords: blockedWordsCheck.words
      });
    }
    
    // Process uploaded CSV file
    if (!req.file) {
      return res.status(400).json({ message: 'Contacts file is required' });
    }
    
    // Save file information
    const file = new File({
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      path: req.file.path,
      size: req.file.size,
      type: 'contacts',
      user: req.session.userId,
      description: `Contacts for campaign: ${name}`
    });
    
    await file.save();
    
    // Count contacts in CSV
    let totalContacts = 0;
    let validContacts = 0;
    let invalidContacts = 0;
    
    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => {
        totalContacts++;
        
        // Check if row has a phone number
        if (data.phone || data.phoneNumber || data.mobile || data.cell) {
          validContacts++;
          results.push(data);
        } else {
          invalidContacts++;
        }
      })
      .on('end', async () => {
        // Update file metadata
        file.metadata = {
          totalContacts,
          validContacts,
          invalidContacts
        };
        await file.save();
        
        // Create campaign
        const campaign = new Campaign({
          name,
          user: req.session.userId,
          callerId: callerId._id,
          contactsFile: file._id,
          messageScript,
          transferKey: transferKey || '1',
          totalContacts: validContacts
        });
        
        await campaign.save();
        
        return res.status(201).json({
          message: 'Campaign created successfully',
          campaign
        });
      });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error creating campaign', 
      error: error.message 
    });
  }
});

// Get all campaigns for current user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { status, sort, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = { user: req.session.userId };
    if (status) {
      query.status = status;
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'name') {
      sortOption = { name: 1 };
    } else if (sort === 'status') {
      sortOption = { status: 1 };
    }
    
    // Get campaigns
    const campaigns = await Campaign.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('callerId', 'phoneNumber description')
      .populate('contactsFile', 'originalname metadata');
    
    // Get total count
    const total = await Campaign.countDocuments(query);
    
    return res.status(200).json({
      campaigns,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting campaigns', 
      error: error.message 
    });
  }
});

// Get a specific campaign
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.session.userId
    })
    .populate('callerId', 'phoneNumber description')
    .populate('contactsFile', 'originalname metadata');
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    return res.status(200).json({ campaign });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting campaign', 
      error: error.message 
    });
  }
});

// Update a campaign
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, messageScript, transferKey } = req.body;
    
    // Find campaign
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    // Check if campaign can be updated
    if (['active', 'completed'].includes(campaign.status)) {
      return res.status(400).json({ 
        message: 'Cannot update an active or completed campaign' 
      });
    }
    
    // Check if message script contains blocked words
    if (messageScript) {
      const blockedWordsCheck = await Blocklist.containsBlockedWords(messageScript);
      if (blockedWordsCheck.contains) {
        return res.status(400).json({ 
          message: 'Message script contains blocked words',
          blockedWords: blockedWordsCheck.words
        });
      }
    }
    
    // Update campaign
    if (name) campaign.name = name;
    if (messageScript) campaign.messageScript = messageScript;
    if (transferKey) campaign.transferKey = transferKey;
    
    await campaign.save();
    
    return res.status(200).json({
      message: 'Campaign updated successfully',
      campaign
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating campaign', 
      error: error.message 
    });
  }
});

// Delete a campaign
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    // Find campaign
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    // Check if campaign can be deleted
    if (campaign.status === 'active') {
      return res.status(400).json({ 
        message: 'Cannot delete an active campaign' 
      });
    }
    
    // Delete campaign
    await campaign.remove();
    
    return res.status(200).json({
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error deleting campaign', 
      error: error.message 
    });
  }
});

// Start a campaign
router.post('/:id/start', isAuthenticated, async (req, res) => {
  try {
    // Find campaign
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    // Check if campaign can be started
    if (campaign.status === 'active') {
      return res.status(400).json({ message: 'Campaign is already active' });
    }
    
    if (campaign.status === 'completed') {
      return res.status(400).json({ message: 'Campaign is already completed' });
    }
    
    // Check if user has enough credits
    const user = await User.findById(req.session.userId);
    const callRate = await Setting.getByKey('call_rate.platform') || 0.05;
    const requiredCredits = campaign.totalContacts * callRate;
    
    if (user.credits < requiredCredits) {
      return res.status(400).json({ 
        message: 'Insufficient credits to start campaign',
        required: requiredCredits,
        available: user.credits
      });
    }
    
    // Update campaign status
    campaign.status = 'active';
    campaign.startTime = new Date();
    await campaign.save();
    
    // In a real application, you would start a background job to process the campaign
    // For this example, we'll just return a success message
    
    return res.status(200).json({
      message: 'Campaign started successfully',
      campaign
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error starting campaign', 
      error: error.message 
    });
  }
});

// Pause a campaign
router.post('/:id/pause', isAuthenticated, async (req, res) => {
  try {
    // Find campaign
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    // Check if campaign can be paused
    if (campaign.status !== 'active') {
      return res.status(400).json({ message: 'Only active campaigns can be paused' });
    }
    
    // Update campaign status
    campaign.status = 'paused';
    await campaign.save();
    
    return res.status(200).json({
      message: 'Campaign paused successfully',
      campaign
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error pausing campaign', 
      error: error.message 
    });
  }
});

// Get campaign statistics
router.get('/:id/stats', isAuthenticated, async (req, res) => {
  try {
    // Find campaign
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    // Get call statistics
    const callStats = await Call.aggregate([
      { $match: { campaign: campaign._id } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        avgDuration: { $avg: '$duration' }
      }}
    ]);
    
    // Format statistics
    const stats = {
      totalContacts: campaign.totalContacts,
      processedContacts: campaign.processedContacts,
      progressPercentage: campaign.progressPercentage,
      callStats: campaign.callStats,
      duration: campaign.durationMinutes,
      detailedStats: callStats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          totalDuration: stat.totalDuration,
          avgDuration: stat.avgDuration
        };
        return acc;
      }, {})
    };
    
    return res.status(200).json({ stats });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting campaign statistics', 
      error: error.message 
    });
  }
});

module.exports = router;
