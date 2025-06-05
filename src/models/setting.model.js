const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['api', 'billing', 'notification', 'system', 'user'],
    default: 'system'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save hook to encrypt sensitive values
settingSchema.pre('save', function(next) {
  // In a real application, you would encrypt sensitive values here
  // For example, API keys, passwords, etc.
  next();
});

// Static method to get a setting by key
settingSchema.statics.getByKey = async function(key) {
  const setting = await this.findOne({ key });
  if (!setting) return null;
  
  // In a real application, you would decrypt sensitive values here
  return setting.value;
};

// Static method to set a setting by key
settingSchema.statics.setByKey = async function(key, value, updatedBy = null) {
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  const update = { 
    value,
    updatedBy,
    updatedAt: new Date()
  };
  
  return this.findOneAndUpdate({ key }, update, options);
};

// Default settings
settingSchema.statics.DEFAULT_SETTINGS = {
  'infobip.api_key': '',
  'infobip.base_url': 'https://api.infobip.com',
  'infobip.voice_url': 'https://api.infobip.com/tts/3/advanced',
  'call_rate.platform': 0.05,
  'call_rate.provider': 0.03,
  'system.max_calls_per_minute': 10,
  'system.max_retry_attempts': 3,
  'system.default_transfer_key': '1',
  'notification.email_enabled': true,
  'notification.sms_enabled': false
};

const Setting = mongoose.model('Setting', settingSchema);

module.exports = Setting;
