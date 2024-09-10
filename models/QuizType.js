const mongoose = require("mongoose");

const quizTypeSchema = new mongoose.Schema({
  typeID: {
    type: String,
    unique: true,
    required: [true, "typeID is required"], // Custom error message
    required: true,
  },
  typeName: {
    type: String,
    // enum: ['MCQs', 0'Descriptive', 'Numerical'],
    required: [true, "typeName is required"],
    required: true,
  },
  order: {
    type: Number,
    required: true,
    unique: true,
  },
  createdBy: {
    type: String,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const QuizType = mongoose.model("QuizType", quizTypeSchema);
module.exports = QuizType;
