const express = require('express');
const router = express.Router();
const axios = require('axios');
const { isAuthenticated, isAdmin } = require('./auth.routes');
const Campaign = require('../models/campaign.model');
const Call = require('../models/call.model');
const CallerId = require('../models/callerId.model');
const User = require('../models/user.model');
const Setting = require('../models/setting.model');
const Billing = require('../models/billing.model');
const File = require('../models/file.model');
const fs = require('fs');
const csv = require('csv-parser');

// Middleware to check API key
const checkApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ message: 'API key is required' });
  }
  
  // Check if API key is valid
  const user = await User.findOne({ apiKey });
  
  if (!user) {
    return res.status(401).json({ message: 'Invalid API key' });
  }
  
  if (!user.isActive) {
    return res.status(403).json({ message: 'User account is disabled' });
  }
  
  req.user = user;
  next();
};

// Get campaign status
router.get('/campaign/:id/status', checkApiKey, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    // Get call statistics
    const callStats = await Call.aggregate([
      { $match: { campaign: campaign._id } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }}
    ]);
    
    // Format statistics
    const stats = {
      id: campaign._id,
      name: campaign.name,
      status: campaign.status,
      totalContacts: campaign.totalContacts,
      processedContacts: campaign.processedContacts,
      progressPercentage: campaign.progressPercentage,
      startTime: campaign.startTime,
      endTime: campaign.endTime,
      callStats: callStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };
    
    return res.status(200).json({ campaign: stats });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting campaign status', 
      error: error.message 
    });
  }
});

// Process a call
router.post('/call/process', async (req, res) => {
  try {
    const { callId, status, duration, dtmfDigits } = req.body;
    
    // Find call
    const call = await Call.findOne({ callId });
    
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }
    
    // Update call status
    call.status = status;
    call.duration = duration || call.duration;
    call.dtmfDigits = dtmfDigits || call.dtmfDigits;
    call.updatedAt = new Date();
    
    // Check if call was transferred
    if (dtmfDigits && call.campaign) {
      const campaign = await Campaign.findById(call.campaign);
      if (campaign && dtmfDigits === campaign.transferKey) {
        call.status = 'transfer';
      }
    }
    
    await call.save();
    
    // Update campaign statistics if needed
    if (call.campaign && ['completed', 'failed', 'busy', 'no-answer', 'transfer'].includes(status)) {
      const campaign = await Campaign.findById(call.campaign);
      
      if (campaign) {
        campaign.processedContacts += 1;
        
        // Check if campaign is completed
        if (campaign.processedContacts >= campaign.totalContacts) {
          campaign.status = 'completed';
          campaign.endTime = new Date();
        }
        
        await campaign.save();
      }
    }
    
    return res.status(200).json({
      message: 'Call processed successfully',
      call
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error processing call', 
      error: error.message 
    });
  }
});

// Infobip webhook for call status updates
router.post('/infobip/webhook', async (req, res) => {
  try {
    const { callId, status, duration, dtmfDigits } = req.body;
    
    // Process call status update
    if (callId) {
      // Find call
      const call = await Call.findOne({ callId });
      
      if (call) {
        // Update call status
        call.status = status || call.status;
        call.duration = duration || call.duration;
        call.dtmfDigits = dtmfDigits || call.dtmfDigits;
        call.updatedAt = new Date();
        
        // Check if call was transferred
        if (dtmfDigits && call.campaign) {
          const campaign = await Campaign.findById(call.campaign);
          if (campaign && dtmfDigits === campaign.transferKey) {
            call.status = 'transfer';
          }
        }
        
        await call.save();
        
        // Update campaign statistics if needed
        if (call.campaign && ['completed', 'failed', 'busy', 'no-answer', 'transfer'].includes(call.status)) {
          const campaign = await Campaign.findById(call.campaign);
          
          if (campaign) {
            campaign.processedContacts += 1;
            
            // Check if campaign is completed
            if (campaign.processedContacts >= campaign.totalContacts) {
              campaign.status = 'completed';
              campaign.endTime = new Date();
            }
            
            await campaign.save();
          }
        }
      }
    }
    
    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ 
      message: 'Error processing webhook', 
      error: error.message 
    });
  }
});

// Make a test call
router.post('/call/test', isAuthenticated, async (req, res) => {
  try {
    const { phoneNumber, messageScript, callerIdId } = req.body;
    
    if (!phoneNumber || !messageScript) {
      return res.status(400).json({ 
        message: 'Phone number and message script are required' 
      });
    }
    
    // Validate caller ID
    let callerId;
    if (callerIdId) {
      callerId = await CallerId.findOne({ 
        _id: callerIdId,
        user: req.session.userId,
        isVerified: true,
        isActive: true
      });
      
      if (!callerId) {
        return res.status(400).json({ message: 'Invalid or unverified caller ID' });
      }
    } else {
      // Get first verified caller ID
      callerId = await CallerId.findOne({ 
        user: req.session.userId,
        isVerified: true,
        isActive: true
      });
      
      if (!callerId) {
        return res.status(400).json({ message: 'No verified caller ID found' });
      }
    }
    
    // Check if user has enough credits
    const user = await User.findById(req.session.userId);
    const callRate = await Setting.getByKey('call_rate.platform') || 0.05;
    
    if (user.credits < callRate) {
      return res.status(400).json({ 
        message: 'Insufficient credits to make a test call',
        required: callRate,
        available: user.credits
      });
    }
    
    // Get Infobip API settings
    const apiKey = await Setting.getByKey('infobip.api_key');
    const voiceUrl = await Setting.getByKey('infobip.voice_url') || 'https://api.infobip.com/tts/3/advanced';
    
    if (!apiKey) {
      return res.status(500).json({ message: 'Infobip API key not configured' });
    }
    
    // Make call using Infobip API
    const callId = `test-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    
    // Create call record
    const call = new Call({
      callId,
      user: req.session.userId,
      phoneNumber,
      callerId: callerId._id,
      status: 'initiated',
      messageScript,
      isTest: true
    });
    
    await call.save();
    
    // Deduct credits
    user.credits -= callRate;
    await user.save();
    
    // Create billing record
    const providerRate = await Setting.getByKey('call_rate.provider') || 0.03;
    const profit = callRate - providerRate;
    
    const billing = new Billing({
      user: user._id,
      type: 'debit',
      amount: callRate,
      credits: callRate,
      description: 'Test call',
      status: 'completed',
      calls: 1,
      callRate,
      platformRate: callRate,
      profit
    });
    
    await billing.save();
    
    // In a real application, you would make an API call to Infobip here
    // For this example, we'll just simulate a successful call
    
    // Simulate call processing
    setTimeout(async () => {
      call.status = 'completed';
      call.duration = 30; // 30 seconds
      call.updatedAt = new Date();
      await call.save();
    }, 5000);
    
    return res.status(200).json({
      message: 'Test call initiated successfully',
      call
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error making test call', 
      error: error.message 
    });
  }
});

// Start processing a campaign
router.post('/campaign/:id/process', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Find campaign
    const campaign = await Campaign.findById(req.params.id)
      .populate('callerId')
      .populate('contactsFile');
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    if (campaign.status !== 'active') {
      return res.status(400).json({ message: 'Campaign is not active' });
    }
    
    // Get user
    const user = await User.findById(campaign.user);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user has enough credits
    const callRate = await Setting.getByKey('call_rate.platform') || 0.05;
    const requiredCredits = campaign.totalContacts * callRate;
    
    if (user.credits < requiredCredits) {
      return res.status(400).json({ 
        message: 'User has insufficient credits',
        required: requiredCredits,
        available: user.credits
      });
    }
    
    // Get Infobip API settings
    const apiKey = await Setting.getByKey('infobip.api_key');
    const voiceUrl = await Setting.getByKey('infobip.voice_url') || 'https://api.infobip.com/tts/3/advanced';
    
    if (!apiKey) {
      return res.status(500).json({ message: 'Infobip API key not configured' });
    }
    
    // Get max calls per minute
    const maxCallsPerMinute = await Setting.getByKey('system.max_calls_per_minute') || 10;
    
    // Process contacts from CSV file
    const contacts = [];
    fs.createReadStream(campaign.contactsFile.path)
      .pipe(csv())
      .on('data', (data) => {
        // Get phone number from CSV
        const phoneNumber = data.phone || data.phoneNumber || data.mobile || data.cell;
        
        if (phoneNumber) {
          contacts.push({
            phoneNumber,
            name: data.name || data.firstName || '',
            lastName: data.lastName || '',
            email: data.email || '',
            company: data.company || '',
            data
          });
        }
      })
      .on('end', async () => {
        // Start processing calls
        const batchSize = maxCallsPerMinute;
        let processedCount = 0;
        
        // Process in batches
        const processBatch = async () => {
          if (processedCount >= contacts.length) {
            // All contacts processed
            return;
          }
          
          // Get current batch
          const batch = contacts.slice(processedCount, processedCount + batchSize);
          processedCount += batch.length;
          
          // Process each contact in batch
          for (const contact of batch) {
            // Create call record
            const callId = `${campaign._id}-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
            
            const call = new Call({
              callId,
              user: campaign.user,
              campaign: campaign._id,
              phoneNumber: contact.phoneNumber,
              callerId: campaign.callerId._id,
              status: 'initiated',
              messageScript: campaign.messageScript,
              contactData: contact.data
            });
            
            await call.save();
            
            // In a real application, you would make an API call to Infobip here
            // For this example, we'll just simulate calls
            
            // Simulate call processing
            setTimeout(async () => {
              // Randomly determine call status
              const statuses = ['answered', 'failed', 'busy', 'no-answer'];
              const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
              
              call.status = randomStatus;
              
              if (randomStatus === 'answered') {
                call.duration = Math.floor(Math.random() * 120) + 10; // 10-130 seconds
                
                // Randomly determine if call was transferred
                const wasTransferred = Math.random() < 0.2; // 20% chance
                if (wasTransferred) {
                  call.status = 'transfer';
                  call.dtmfDigits = campaign.transferKey;
                }
              }
              
              call.updatedAt = new Date();
              await call.save();
              
              // Update campaign statistics
              campaign.processedContacts += 1;
              
              // Check if campaign is completed
              if (campaign.processedContacts >= campaign.totalContacts) {
                campaign.status = 'completed';
                campaign.endTime = new Date();
              }
              
              await campaign.save();
            }, Math.floor(Math.random() * 10000) + 2000); // 2-12 seconds
          }
          
          // Wait for next batch
          if (processedCount < contacts.length) {
            setTimeout(processBatch, 60000); // Wait 1 minute before next batch
          } else {
            // Deduct credits
            const totalCost = contacts.length * callRate;
            user.credits -= totalCost;
            await user.save();
            
            // Create billing record
            const providerRate = await Setting.getByKey('call_rate.provider') || 0.03;
            const profit = (callRate - providerRate) * contacts.length;
            
            const billing = new Billing({
              user: user._id,
              type: 'debit',
              amount: totalCost,
              credits: totalCost,
              description: `Campaign: ${campaign.name}`,
              status: 'completed',
              campaign: campaign._id,
              calls: contacts.length,
              callRate,
              platformRate: callRate,
              profit
            });
            
            await billing.save();
          }
        };
        
        // Start processing
        processBatch();
        
        return res.status(200).json({
          message: 'Campaign processing started successfully',
          campaign: {
            id: campaign._id,
            name: campaign.name,
            totalContacts: contacts.length,
            maxCallsPerMinute
          }
        });
      });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error processing campaign', 
      error: error.message 
    });
  }
});

module.exports = router;
