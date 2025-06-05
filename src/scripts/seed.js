const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import models
const User = require('../models/user.model');
const Setting = require('../models/setting.model');

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voicebroadcast', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Default settings
const defaultSettings = {
  'system.max_calls_per_minute': 10,
  'system.max_retry_attempts': 3,
  'system.default_transfer_key': '1',
  'call_rate.platform': 0.05,
  'call_rate.provider': 0.03,
  'infobip.base_url': 'https://api.infobip.com',
  'infobip.voice_url': 'https://api.infobip.com/tts/3/advanced',
  'email.service': 'smtp',
  'email.host': 'smtp.example.com',
  'email.port': 587,
  'email.from': 'noreply@voicebroadcast.com'
};

// Create admin user
const createAdminUser = async () => {
  try {
    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      return;
    }
    
    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const adminUser = new User({
      name: 'Admin User',
      email: 'admin@example.com',
      username: 'admin',
      password: hashedPassword,
      phoneNumber: '+1234567890',
      role: 'admin',
      isActive: true,
      credits: 1000,
      apiKey: 'admin-api-key-' + Date.now()
    });
    
    await adminUser.save();
    console.log('Admin user created successfully');
    
    return adminUser;
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw error;
  }
};

// Create default settings
const createDefaultSettings = async (adminId) => {
  try {
    const settingsPromises = Object.entries(defaultSettings).map(async ([key, value]) => {
      // Check if setting already exists
      const existingSetting = await Setting.findOne({ key });
      
      if (existingSetting) {
        console.log(`Setting ${key} already exists`);
        return;
      }
      
      // Determine category from key
      let category = 'system';
      if (key.startsWith('infobip.')) {
        category = 'api';
      } else if (key.startsWith('call_rate.')) {
        category = 'billing';
      } else if (key.startsWith('email.')) {
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
        updatedBy: adminId
      });
      
      await setting.save();
      console.log(`Setting ${key} created successfully`);
    });
    
    await Promise.all(settingsPromises);
    console.log('Default settings created successfully');
  } catch (error) {
    console.error('Error creating default settings:', error);
    throw error;
  }
};

// Create required directories
const createDirectories = () => {
  try {
    const dirs = [
      path.join(__dirname, '../../uploads'),
      path.join(__dirname, '../../uploads/audio'),
      path.join(__dirname, '../../uploads/contacts'),
      path.join(__dirname, '../../uploads/documents')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Directory ${dir} created successfully`);
      } else {
        console.log(`Directory ${dir} already exists`);
      }
    });
  } catch (error) {
    console.error('Error creating directories:', error);
    throw error;
  }
};

// Run seed
const runSeed = async () => {
  try {
    console.log('Starting seed process...');
    
    // Create directories
    createDirectories();
    
    // Create admin user
    const adminUser = await createAdminUser();
    
    // Create default settings
    if (adminUser) {
      await createDefaultSettings(adminUser._id);
    }
    
    console.log('Seed process completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seed process failed:', error);
    process.exit(1);
  }
};

// Run seed
runSeed();
