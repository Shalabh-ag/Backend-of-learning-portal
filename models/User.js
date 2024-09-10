  const mongoose = require('mongoose');
  const Schema = mongoose.Schema;
  const userSchema = new Schema({
    name: {
      type: String,
      required: true, 
      trim: true
    },
    email: {
      type: String,
      required: true, 
      unique: true,    
      trim: true      
    },
    role: {
      type: String,
      enum: ['student', 'teacher'],
      required: true
    },
    tokens: [
      {
        token: {
          type: String,
          required: true,
          unique: true,
          sparse: true
        }
      }
    ]
  });
  const User = mongoose.model('User', userSchema);
  module.exports = User;