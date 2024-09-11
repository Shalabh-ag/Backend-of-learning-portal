const mongoose = require("mongoose");

const StudentMarksSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student", // Assuming you have a Student collection
    required: [true, "userId is required"], // Custom error message
  },
  quizId: {
    type: String,
    ref: "Quiz", // Assuming you have a Quiz collection
    required: [true, "quizId is required"],
  },
  mcqPercentage: {
    type: Number,
    required: [true, "MCQ percentage is required"],
  },
  descriptivePercentage: {
    type: Number,
    required: [true, "Descriptive percentage is required"],
  },
  numericalPercentage: {
    type: Number,
    required: [true, "Numerical percentage is required"],
  },
  totalPercentage: {
    type: Number,
    required: [true, "Total percentage is required"],
  },
  grade: {
    type: String, // New field for grade
    required: [true, "grade is required"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },

});

module.exports = mongoose.model("StudentMarks", StudentMarksSchema);
