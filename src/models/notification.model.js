const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info'
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  recipients: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    read: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date
    }
  }],
  isGlobal: {
    type: Boolean,
    default: false
  },
  link: {
    type: String,
    trim: true
  },
  expiresAt: {
    type: Date
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

// Virtual for notification age
notificationSchema.virtual('age').get(function() {
  const now = new Date();
  const created = this.createdAt || now;
  const diffMs = now - created;
  const diffMins = Math.round(diffMs / (1000 * 60));
  
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  }
  
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }
  
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
});

// Static method to mark notification as read
notificationSchema.statics.markAsRead = async function(notificationId, userId) {
  return this.updateOne(
    { 
      _id: notificationId,
      'recipients.user': userId,
      'recipients.read': false
    },
    {
      $set: {
        'recipients.$.read': true,
        'recipients.$.readAt': new Date()
      }
    }
  );
};

// Static method to get unread notifications for a user
notificationSchema.statics.getUnreadForUser = async function(userId) {
  return this.find({
    'recipients.user': userId,
    'recipients.read': false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  }).sort({ createdAt: -1 });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
