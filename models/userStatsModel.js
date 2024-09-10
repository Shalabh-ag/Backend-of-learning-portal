const mongoose = require("mongoose");

const UserStatsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the User collection
    required: [true, "userId is required"], // Custom error message
  },
  totalQuizzes: {
    type: Number,
    default: 0,
    min: [0, "Total quizzes cannot be negative"], // Ensures the value is not negative
  },
  publicQuizzes: {
    type: Number,
    default: 0,
    min: [0, "Public quizzes cannot be negative"],
  },
  privateQuizzes: {
    type: Number,
    default: 0,
    min: [0, "Private quizzes cannot be negative"],
  },
  normalQuizzes: {
    type: Number,
    default: 0,
    min: [0, "Normal quizzes cannot be negative"],
  },
  quickQuizzes: {
    type: Number,
    default: 0,
    min: [0, "Quick quizzes cannot be negative"],
  },
  totalBooks: {
    type: Number,
    default: 0,
    min: [0, "Total books cannot be negative"],
  },
  publicBooks: {
    type: Number,
    default: 0,
    min: [0, "Public books cannot be negative"],
  },
  privateBooks: {
    type: Number,
    default: 0,
    min: [0, "Private books cannot be negative"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("UserStats", UserStatsSchema);
