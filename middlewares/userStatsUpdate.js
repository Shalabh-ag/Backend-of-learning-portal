const mongoose = require('mongoose');
const Book = require('../models/Book');
const Quiz=require('../models/QuizModel')
const UserStats = require('../models/userStatsModel');

async function updateUserStats(userId) {
 try {
   const quizzes = await Quiz.find({ createdBy: userId });
   const totalQuizzes = quizzes.length;
   const publicQuizzes = quizzes.filter(quiz => !quiz.isPrivate).length;
   const privateQuizzes = quizzes.filter(quiz => quiz.isPrivate).length;
   const normalQuizzes = quizzes.filter(quiz => !quiz.quickQuiz).length;
   const quickQuizzes = quizzes.filter(quiz => quiz.quickQuiz).length;

   const books = await Book.find({ user: userId });
   const totalBooks = books.length;
   const publicBooks = books.filter(book => !book.private).length;
   const privateBooks = books.filter(book => book.private).length;

   await UserStats.findOneAndUpdate(
     { userId: userId },
     {
       totalQuizzes,
       publicQuizzes,
       privateQuizzes,
       normalQuizzes,
       quickQuizzes,
       totalBooks,
       publicBooks,
       privateBooks,
     },
     { upsert: true, new: true }
   );
 } catch (err) {
   console.error('Error updating user stats:', err);
 }
}

module.exports={updateUserStats};
