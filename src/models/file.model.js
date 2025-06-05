const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    trim: true
  },
  originalname: {
    type: String,
    required: true,
    trim: true
  },
  mimetype: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['audio', 'contacts', 'document'],
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  metadata: {
    // For audio files
    duration: Number,
    format: String,
    
    // For contact files
    totalContacts: Number,
    validContacts: Number,
    invalidContacts: Number,
    
    // For documents
    pages: Number
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

// Virtual for file URL
fileSchema.virtual('url').get(function() {
  return `/api/files/${this._id}`;
});

// Virtual for file extension
fileSchema.virtual('extension').get(function() {
  return this.originalname.split('.').pop();
});

const File = mongoose.model('File', fileSchema);

module.exports = File;
