const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Subject Schema
const subjectSchema = new mongoose.Schema({
  subjectName: {
    type: String,
    required: true,
    trim: true,
  },
  subjectId: {
    type: String,
    unique: true,
    default: uuidv4 // Automatically generate a unique ID
  }
});

const SubjectModel = mongoose.model('Subject', subjectSchema);
module.exports=SubjectModel;
