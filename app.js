const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const userRoute = require('./routes/UserRoute'); // Import the user route
const bookRoute = require('./routes/BookRoute'); // Import the user route
const ChapterRoute = require('./routes/ChapterRoute'); // Import the user route
const quizRoute = require('./routes/QuizRoutes'); // Import the user route
const subjectRoute=require('./routes/SubjectRoutes')
const studentRoute=require('./routes/StudentQuizRoute')
const { getServerIpAddress } = require('./utils/ipFetcher');
const ChatBotRoutes = require('./routes/ChatBotRoutes')
dotenv.config();

const app = express();

// Configure CORS
app.use(cors({
    origin: true,
    credentials: true
}));

// Uncomment and adjust CORS configuration if needed
// const allowedOrigins = [process.env.FRONTEND_IP];

// app.use(cors({
//     origin: function (origin, callback) {
//         if (!origin) return callback(null, true);
//         if (allowedOrigins.indexOf(origin) === -1) {
//           const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
//           return callback(new Error(msg), false);
//         }
//         return callback(null, true);
//     },
//     credentials: true
// }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
    
// Use the user route
app.use('/api/users', userRoute);
app.use('/api/books',bookRoute);
app.use('/api/chapters',ChapterRoute);
app.use('/api/quiz',quizRoute);
app.use('/api/subject',subjectRoute)
app.use('/api/student',studentRoute)
app.use('/api/chatbot',ChatBotRoutes)
mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log("Connected to MongoDB");
    const server = app.listen(process.env.PORT || 8000, "0.0.0.0", (error) => {
        if (error) {
            console.error("Server failed to start:", error.message);
            return;
        }
        const serverIp = getServerIpAddress();
        if (serverIp === -1) {
            console.error("Couldn't fetch the server IP!");
            return;
        }
        console.log(`Server started at http://${serverIp}:${process.env.PORT}`);
    });
    // server.setTimeout(10 * 60 * 1000);
}).catch(error => {
    console.error("Error connecting to MongoDB:", error.message);
});
app.use('/', (req, res) => {
    return res.status(200).json({ message: 'Welcome to the API!' });
  });
  