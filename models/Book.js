const mongoose = require('mongoose');
const { isURL } = require('validator'); // Importing an external validator function

const bookSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Book name is required'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true,
    default: '' // Optional: Default to empty string if not provided
  },
  coverImage: {
    type: String,
    required: true,
    trim: true,
    validate: [isURL, 'Invalid cover image URL'] // Validates that coverImage is a valid URL
  },
  bookId: {
    type: String,
    unique: true
  },
  private: {
    type: Boolean,
    default: false,
  },
  embFile: {
    type: String
  },
  embeddingLink: {
    type: String
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  chapters: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter' // Reference to the Chapter model
  }],
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject', // Reference to the Subject model,
    required:true,
    default:null
  }
});

const Book = mongoose.model('Book', bookSchema);
module.exports = Book;
