const mongoose = require('mongoose');

const blocklistSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  category: {
    type: String,
    enum: ['profanity', 'spam', 'illegal', 'custom'],
    default: 'custom'
  },
  description: {
    type: String,
    trim: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Case-insensitive search for blocked words
blocklistSchema.index({ word: 'text' });

// Static method to check if a text contains blocked words
blocklistSchema.statics.containsBlockedWords = async function(text) {
  if (!text) return { contains: false, words: [] };
  
  const blockedWords = await this.find({ isActive: true });
  const blockedWordsFound = [];
  
  for (const blockedWord of blockedWords) {
    const regex = new RegExp(`\\b${blockedWord.word}\\b`, 'i');
    if (regex.test(text)) {
      blockedWordsFound.push(blockedWord.word);
    }
  }
  
  return {
    contains: blockedWordsFound.length > 0,
    words: blockedWordsFound
  };
};

const Blocklist = mongoose.model('Blocklist', blocklistSchema);

module.exports = Blocklist;
