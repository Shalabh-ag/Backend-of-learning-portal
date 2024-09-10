const mongoose = require('mongoose');
const {isURL}=require('validator')
const chapterSchema = new mongoose.Schema({
  chapterName: {
    type: String,
    required: [true, 'Chapter name is required'], // Custom error message
    trim: true
  },
  chapterURL: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: (value) => isURL(value), // Validates if it's a URL
      message: 'Invalid URL format' // Custom error message for invalid URL
    }
  },
  chapterId: {
    type: String,
    unique: true,
    required: [true, 'Chapter ID is required'] 
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  }
});

const Chapter = mongoose.model('Chapter', chapterSchema);
module.exports = Chapter;
