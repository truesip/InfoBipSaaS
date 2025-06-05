const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('./auth.routes');
const Blocklist = require('../models/blocklist.model');

// Get all blocked words
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { category, sort, limit = 10, page = 1, search } = req.query;
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
          { word: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'word') {
      sortOption = { word: 1 };
    } else if (sort === 'category') {
      sortOption = { category: 1 };
    }
    
    // Get blocked words
    const blockedWords = await Blocklist.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('addedBy', 'name email');
    
    // Get total count
    const total = await Blocklist.countDocuments(query);
    
    return res.status(200).json({
      blockedWords,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting blocked words', 
      error: error.message 
    });
  }
});

// Add a new blocked word (admin only)
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { word, category, description } = req.body;
    
    if (!word) {
      return res.status(400).json({ message: 'Word is required' });
    }
    
    // Check if word already exists
    const existingWord = await Blocklist.findOne({ 
      word: { $regex: `^${word}$`, $options: 'i' }
    });
    
    if (existingWord) {
      return res.status(400).json({ 
        message: 'Word is already in the blocklist' 
      });
    }
    
    // Create new blocked word
    const blockedWord = new Blocklist({
      word,
      category: category || 'custom',
      description,
      addedBy: req.session.userId
    });
    
    await blockedWord.save();
    
    return res.status(201).json({
      message: 'Word added to blocklist successfully',
      blockedWord
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error adding word to blocklist', 
      error: error.message 
    });
  }
});

// Add multiple blocked words (admin only)
router.post('/batch', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { words, category, description } = req.body;
    
    if (!words || !Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ message: 'Words array is required' });
    }
    
    // Filter out empty words
    const validWords = words.filter(word => word && word.trim().length > 0);
    
    if (validWords.length === 0) {
      return res.status(400).json({ message: 'No valid words provided' });
    }
    
    // Check for existing words
    const existingWords = await Blocklist.find({
      word: { $in: validWords.map(w => new RegExp(`^${w}$`, 'i')) }
    });
    
    const existingWordsSet = new Set(existingWords.map(w => w.word.toLowerCase()));
    
    // Filter out words that already exist
    const newWords = validWords.filter(w => !existingWordsSet.has(w.toLowerCase()));
    
    if (newWords.length === 0) {
      return res.status(400).json({ message: 'All words already exist in the blocklist' });
    }
    
    // Create new blocked words
    const blockedWords = newWords.map(word => ({
      word,
      category: category || 'custom',
      description,
      addedBy: req.session.userId
    }));
    
    const result = await Blocklist.insertMany(blockedWords);
    
    return res.status(201).json({
      message: `${result.length} words added to blocklist successfully`,
      added: result.length,
      skipped: validWords.length - result.length
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error adding words to blocklist', 
      error: error.message 
    });
  }
});

// Get a specific blocked word
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const blockedWord = await Blocklist.findById(req.params.id)
      .populate('addedBy', 'name email');
    
    if (!blockedWord) {
      return res.status(404).json({ message: 'Blocked word not found' });
    }
    
    return res.status(200).json({ blockedWord });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting blocked word', 
      error: error.message 
    });
  }
});

// Update a blocked word (admin only)
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { category, description, isActive } = req.body;
    
    // Find blocked word
    const blockedWord = await Blocklist.findById(req.params.id);
    
    if (!blockedWord) {
      return res.status(404).json({ message: 'Blocked word not found' });
    }
    
    // Update blocked word
    if (category) blockedWord.category = category;
    if (description !== undefined) blockedWord.description = description;
    if (isActive !== undefined) blockedWord.isActive = isActive;
    
    await blockedWord.save();
    
    return res.status(200).json({
      message: 'Blocked word updated successfully',
      blockedWord
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating blocked word', 
      error: error.message 
    });
  }
});

// Delete a blocked word (admin only)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Find blocked word
    const blockedWord = await Blocklist.findById(req.params.id);
    
    if (!blockedWord) {
      return res.status(404).json({ message: 'Blocked word not found' });
    }
    
    // Delete blocked word
    await blockedWord.remove();
    
    return res.status(200).json({
      message: 'Blocked word deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error deleting blocked word', 
      error: error.message 
    });
  }
});

// Check if text contains blocked words
router.post('/check', isAuthenticated, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }
    
    const result = await Blocklist.containsBlockedWords(text);
    
    return res.status(200).json({
      contains: result.contains,
      words: result.words
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error checking text for blocked words', 
      error: error.message 
    });
  }
});

module.exports = router;
