const mongoose = require('mongoose');

const callerIdSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String
  },
  verificationExpires: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
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

// Generate verification code
callerIdSchema.methods.generateVerificationCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verificationCode = code;
  this.verificationExpires = Date.now() + 3600000; // 1 hour
  return code;
};

// Check if verification code is valid
callerIdSchema.methods.isVerificationCodeValid = function(code) {
  return this.verificationCode === code && 
         this.verificationExpires > Date.now();
};

const CallerId = mongoose.model('CallerId', callerIdSchema);

module.exports = CallerId;
