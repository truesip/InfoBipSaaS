const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('./auth.routes');
const Setting = require('../models/setting.model');

// Get public settings
router.get('/public', async (req, res) => {
  try {
    // Get all public settings
    const settings = await Setting.find({ isPublic: true });
    
    // Format settings as key-value pairs
    const formattedSettings = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    
    return res.status(200).json({ settings: formattedSettings });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting public settings', 
      error: error.message 
    });
  }
});

// Get all settings (admin only)
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { category, sort, limit = 50, page = 1, search } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query = {
        ...query,
        $or: [
          { key: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Build sort
    let sortOption = { key: 1 }; // Default sort by key
    if (sort === 'category') {
      sortOption = { category: 1, key: 1 };
    } else if (sort === 'updated') {
      sortOption = { updatedAt: -1 };
    }
    
    // Get settings
    const settings = await Setting.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('updatedBy', 'name email');
    
    // Get total count
    const total = await Setting.countDocuments(query);
    
    return res.status(200).json({
      settings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting settings', 
      error: error.message 
    });
  }
});

// Get a specific setting (admin only)
router.get('/:key', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: req.params.key })
      .populate('updatedBy', 'name email');
    
    if (!setting) {
      return res.status(404).json({ message: 'Setting not found' });
    }
    
    return res.status(200).json({ setting });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting setting', 
      error: error.message 
    });
  }
});

// Update a setting (admin only)
router.put('/:key', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { value, description, category, isPublic, isEncrypted } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ message: 'Value is required' });
    }
    
    // Find or create setting
    let setting = await Setting.findOne({ key: req.params.key });
    
    if (!setting) {
      // Create new setting
      setting = new Setting({
        key: req.params.key,
        value,
        description: description || '',
        category: category || 'system',
        isPublic: isPublic || false,
        isEncrypted: isEncrypted || false,
        updatedBy: req.session.userId
      });
    } else {
      // Update existing setting
      setting.value = value;
      if (description !== undefined) setting.description = description;
      if (category) setting.category = category;
      if (isPublic !== undefined) setting.isPublic = isPublic;
      if (isEncrypted !== undefined) setting.isEncrypted = isEncrypted;
      setting.updatedBy = req.session.userId;
      setting.updatedAt = new Date();
    }
    
    await setting.save();
    
    return res.status(200).json({
      message: 'Setting updated successfully',
      setting
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating setting', 
      error: error.message 
    });
  }
});

// Delete a setting (admin only)
router.delete('/:key', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Find setting
    const setting = await Setting.findOne({ key: req.params.key });
    
    if (!setting) {
      return res.status(404).json({ message: 'Setting not found' });
    }
    
    // Delete setting
    await setting.remove();
    
    return res.status(200).json({
      message: 'Setting deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error deleting setting', 
      error: error.message 
    });
  }
});

// Initialize default settings (admin only)
router.post('/initialize', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const defaultSettings = Setting.DEFAULT_SETTINGS;
    const results = [];
    
    // Create or update each default setting
    for (const [key, value] of Object.entries(defaultSettings)) {
      // Skip if setting already exists
      const existingSetting = await Setting.findOne({ key });
      if (existingSetting) {
        results.push({ key, status: 'skipped' });
        continue;
      }
      
      // Determine category from key
      let category = 'system';
      if (key.startsWith('infobip.')) {
        category = 'api';
      } else if (key.startsWith('call_rate.')) {
        category = 'billing';
      } else if (key.startsWith('notification.')) {
        category = 'notification';
      }
      
      // Create setting
      const setting = new Setting({
        key,
        value,
        description: `Default setting for ${key}`,
        category,
        isPublic: key.startsWith('system.') || key.startsWith('call_rate.'),
        isEncrypted: key.includes('api_key') || key.includes('password'),
        updatedBy: req.session.userId
      });
      
      await setting.save();
      results.push({ key, status: 'created' });
    }
    
    return res.status(200).json({
      message: 'Default settings initialized successfully',
      results
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error initializing default settings', 
      error: error.message 
    });
  }
});

// Update Infobip API settings (admin only)
router.post('/infobip', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { apiKey, baseUrl, voiceUrl } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ message: 'API key is required' });
    }
    
    // Update settings
    if (apiKey) {
      await Setting.setByKey('infobip.api_key', apiKey, req.session.userId);
    }
    
    if (baseUrl) {
      await Setting.setByKey('infobip.base_url', baseUrl, req.session.userId);
    }
    
    if (voiceUrl) {
      await Setting.setByKey('infobip.voice_url', voiceUrl, req.session.userId);
    }
    
    return res.status(200).json({
      message: 'Infobip API settings updated successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating Infobip API settings', 
      error: error.message 
    });
  }
});

// Update email settings (admin only)
router.post('/email', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { service, host, port, user, pass, from } = req.body;
    
    // Update settings
    if (service) {
      await Setting.setByKey('email.service', service, req.session.userId);
    }
    
    if (host) {
      await Setting.setByKey('email.host', host, req.session.userId);
    }
    
    if (port) {
      await Setting.setByKey('email.port', parseInt(port), req.session.userId);
    }
    
    if (user) {
      await Setting.setByKey('email.user', user, req.session.userId);
    }
    
    if (pass) {
      await Setting.setByKey('email.pass', pass, req.session.userId);
    }
    
    if (from) {
      await Setting.setByKey('email.from', from, req.session.userId);
    }
    
    return res.status(200).json({
      message: 'Email settings updated successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating email settings', 
      error: error.message 
    });
  }
});

// Update system settings (admin only)
router.post('/system', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { maxCallsPerMinute, maxRetryAttempts, defaultTransferKey } = req.body;
    
    // Update settings
    if (maxCallsPerMinute !== undefined) {
      await Setting.setByKey('system.max_calls_per_minute', parseInt(maxCallsPerMinute), req.session.userId);
    }
    
    if (maxRetryAttempts !== undefined) {
      await Setting.setByKey('system.max_retry_attempts', parseInt(maxRetryAttempts), req.session.userId);
    }
    
    if (defaultTransferKey) {
      await Setting.setByKey('system.default_transfer_key', defaultTransferKey, req.session.userId);
    }
    
    return res.status(200).json({
      message: 'System settings updated successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating system settings', 
      error: error.message 
    });
  }
});

module.exports = router;
