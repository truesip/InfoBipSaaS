const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
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
  contactsFile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  messageScript: {
    type: String,
    required: true
  },
  transferKey: {
    type: String,
    default: '1'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'paused', 'completed', 'failed'],
    default: 'pending'
  },
  callsPerMinute: {
    type: Number,
    default: 10,
    min: 1,
    max: 20
  },
  totalContacts: {
    type: Number,
    default: 0
  },
  processedContacts: {
    type: Number,
    default: 0
  },
  callStats: {
    answered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    inProgress: { type: Number, default: 0 },
    busy: { type: Number, default: 0 },
    noAnswer: { type: Number, default: 0 },
    transferred: { type: Number, default: 0 },
    completed: { type: Number, default: 0 }
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
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

// Virtual for campaign progress percentage
campaignSchema.virtual('progressPercentage').get(function() {
  if (this.totalContacts === 0) return 0;
  return Math.round((this.processedContacts / this.totalContacts) * 100);
});

// Virtual for campaign duration in minutes
campaignSchema.virtual('durationMinutes').get(function() {
  if (!this.startTime) return 0;
  const endTime = this.endTime || new Date();
  return Math.round((endTime - this.startTime) / (1000 * 60));
});

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign;
