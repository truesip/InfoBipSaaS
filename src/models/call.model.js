const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallerId',
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  contactName: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'answered', 'busy', 'no-answer', 'failed', 'transferred', 'completed'],
    default: 'pending'
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number,
    default: 0 // in seconds
  },
  transferredTo: {
    type: String,
    trim: true
  },
  recordingUrl: {
    type: String,
    trim: true
  },
  cost: {
    type: Number,
    default: 0
  },
  infobipCallId: {
    type: String,
    trim: true
  },
  errorMessage: {
    type: String,
    trim: true
  },
  retryCount: {
    type: Number,
    default: 0
  },
  metadata: {
    type: Map,
    of: String
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

// Virtual for call duration in minutes
callSchema.virtual('durationMinutes').get(function() {
  return this.duration ? Math.round(this.duration / 60) : 0;
});

// Virtual for call success
callSchema.virtual('isSuccessful').get(function() {
  return ['answered', 'transferred', 'completed'].includes(this.status);
});

const Call = mongoose.model('Call', callSchema);

module.exports = Call;
