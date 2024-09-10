const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const quizSchema = new mongoose.Schema({
  quizID: {
    type: String,
    required: true,
    unique: true,
    default: uuidv4 // Automatically generate UUID for quizID
  },
  quizName: {
    type: String,
    required: [true, 'Quiz name is required'], // Custom error message
    required: true
  },
  description: {
    type: String,
    trim:true
  },
  quickQuiz: {
    type: Boolean,
    default: false
  },
  chapterList: [{
    type: String, // Assuming these are the chapter PDF links
    required: true
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  subject:{
    type:String,
    trim:true
  },
  completedTrue:{
    type:Boolean,
    default:false
  }
});


const Quiz = mongoose.model('Quiz', quizSchema);
module.exports = Quiz;