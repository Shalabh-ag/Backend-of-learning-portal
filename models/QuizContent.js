const mongoose = require('mongoose');
const { isUUID } = require('validator'); // Importing isUUID from the validator library
const quizContentSchema = new mongoose.Schema({
  quizID: {
    type: String,
    required: [true, 'Quiz ID is required'],
    ref: 'Quiz',
    validate: {
      validator: (value) => isUUID(value, 4), // Ensures it's a valid UUID version 4
      message: 'Invalid Quiz ID format'
    }
  },
  typeId: { // Use typeId as a UUID string
    type: String,
    required: [true, 'Type ID is required'],
    validate: {
      validator: (value) => isUUID(value, 4), // Ensures typeId is a valid UUID version 4
      message: 'Invalid Type ID format'
    }
  },
  easyQuestionsCount: {
    type: Number,
    default: 0,
    min: [0, 'Easy questions count cannot be negative']
  },
  mediumQuestionsCount: {
    type: Number,
    default: 0,
    min: [0, 'Medium questions count cannot be negative']
  },
  hardQuestionsCount: {
    type: Number,
    default: 0,
    min: [0, 'Hard questions count cannot be negative']
  },
  generatedQuestions: {
    type: mongoose.Schema.Types.Mixed // Store generated questions as JSON
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const QuizContent = mongoose.model('QuizContent', quizContentSchema);
module.exports = QuizContent;
