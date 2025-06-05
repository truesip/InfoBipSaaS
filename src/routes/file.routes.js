const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { isAuthenticated, isAdmin } = require('./auth.routes');
const File = require('../models/file.model');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir;
    
    // Determine upload directory based on file type
    if (file.mimetype.startsWith('audio/')) {
      uploadDir = path.join(__dirname, '../../uploads/audio');
    } else if (file.originalname.endsWith('.csv')) {
      uploadDir = path.join(__dirname, '../../uploads/contacts');
    } else {
      uploadDir = path.join(__dirname, '../../uploads/documents');
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept audio files, CSV files, and common document types
  if (
    file.mimetype.startsWith('audio/') ||
    file.originalname.endsWith('.csv') ||
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'application/msword' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.mimetype === 'text/plain'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter
});

// Upload a file
router.post('/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Determine file type
    let fileType = 'document';
    if (req.file.mimetype.startsWith('audio/')) {
      fileType = 'audio';
    } else if (req.file.originalname.endsWith('.csv')) {
      fileType = 'contacts';
    }
    
    // Create file record
    const file = new File({
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      path: req.file.path,
      size: req.file.size,
      type: fileType,
      user: req.session.userId,
      description: req.body.description || ''
    });
    
    // Process file metadata based on type
    if (fileType === 'contacts') {
      // Count contacts in CSV
      let totalContacts = 0;
      let validContacts = 0;
      let invalidContacts = 0;
      
      const results = [];
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
          totalContacts++;
          
          // Check if row has a phone number
          if (data.phone || data.phoneNumber || data.mobile || data.cell) {
            validContacts++;
            results.push(data);
          } else {
            invalidContacts++;
          }
        })
        .on('end', async () => {
          // Update file metadata
          file.metadata = {
            totalContacts,
            validContacts,
            invalidContacts
          };
          
          await file.save();
          
          return res.status(201).json({
            message: 'File uploaded successfully',
            file
          });
        });
    } else {
      // For non-CSV files, save directly
      await file.save();
      
      return res.status(201).json({
        message: 'File uploaded successfully',
        file
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error uploading file', 
      error: error.message 
    });
  }
});

// Get all files for current user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { type, sort, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = { user: req.session.userId };
    if (type) {
      query.type = type;
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'name') {
      sortOption = { originalname: 1 };
    } else if (sort === 'size') {
      sortOption = { size: -1 };
    }
    
    // Get files
    const files = await File.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const total = await File.countDocuments(query);
    
    return res.status(200).json({
      files,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting files', 
      error: error.message 
    });
  }
});

// Get a specific file
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    return res.status(200).json({ file });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting file', 
      error: error.message 
    });
  }
});

// Download a file
router.get('/:id/download', isAuthenticated, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Check if file exists on disk
    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }
    
    // Set content type
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalname}"`);
    
    // Stream file to response
    const fileStream = fs.createReadStream(file.path);
    fileStream.pipe(res);
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error downloading file', 
      error: error.message 
    });
  }
});

// Update file description
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { description } = req.body;
    
    // Find file
    const file = await File.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Update file
    if (description) file.description = description;
    
    await file.save();
    
    return res.status(200).json({
      message: 'File updated successfully',
      file
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error updating file', 
      error: error.message 
    });
  }
});

// Delete a file
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    // Find file
    const file = await File.findOne({
      _id: req.params.id,
      user: req.session.userId
    });
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Check if file is used in any active campaigns
    const Campaign = require('../models/campaign.model');
    const activeCampaigns = await Campaign.countDocuments({
      contactsFile: file._id,
      status: 'active'
    });
    
    if (activeCampaigns > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete file used in active campaigns' 
      });
    }
    
    // Delete file from disk
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    // Delete file record
    await file.remove();
    
    return res.status(200).json({
      message: 'File deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error deleting file', 
      error: error.message 
    });
  }
});

// Get all files (admin only)
router.get('/admin/all', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { type, sort, limit = 10, page = 1, search } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    if (type) {
      query.type = type;
    }
    
    if (search) {
      query = {
        ...query,
        $or: [
          { originalname: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Build sort
    let sortOption = { createdAt: -1 }; // Default sort by creation date
    if (sort === 'name') {
      sortOption = { originalname: 1 };
    } else if (sort === 'size') {
      sortOption = { size: -1 };
    }
    
    // Get files
    const files = await File.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'name email');
    
    // Get total count
    const total = await File.countDocuments(query);
    
    return res.status(200).json({
      files,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error getting files', 
      error: error.message 
    });
  }
});

module.exports = router;
