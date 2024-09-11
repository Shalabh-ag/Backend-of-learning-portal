const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const QuizType = require("../models/QuizType");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const Book = require("../models/Book");
const Quiz = require("../models/QuizModel");
const QuizContent = require("../models/QuizContent");
const { postAPI } = require("../utils/axiosURI");
const StudentMarks = require("../models/StudentMarks");
const { updateUserStats } = require("../middlewares/userStatsUpdate");
const { body, header, validationResult, query } = require("express-validator");
const path = require("path");
const multer = require("multer");
const {
  deleteBlobFromAzure,
  uploadToAzure,
} = require("../utils/azureFunctions");
const Chapter = require("../models/Chapter");
const Subject = require("../models/SubjectModel");

require("dotenv").config();

const { verifyTokenMiddleware } = require("../middlewares/jwtVerifier");

router.use(verifyTokenMiddleware);

const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get("/quiz-types", async (req, res) => {
  try {
    // Fetch all quiz types from the database
    const quizTypes = await QuizType.find({}).select("typeID typeName");

    // Check if any quiz types are found
    if (!quizTypes || quizTypes.length === 0) {
      return res.status(404).json({ message: "No quiz types found" });
    }

    // Respond with the list of quiz types including their IDs
    return res.status(200).json({ quizTypes });
  } catch (error) {
    console.error("Error fetching quiz types:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post(
  "/add-quiz-type",
  [
    header("user-id").notEmpty().withMessage("User ID is required"),
    body("typeName")
      .notEmpty()
      .withMessage("Quiz type name is required")
      .isString()
      .withMessage("Quiz type name must be a string"),
  ],
  async (req, res) => {
    try {
      // Validate request inputs
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { typeName } = req.body;
      const userId = req.headers["user-id"];

      // Check if the typeName already exists
      const existingQuizType = await QuizType.findOne({ typeName });
      if (existingQuizType) {
        return res.status(400).json({ error: "Quiz type already exists" });
      }

      // Determine the order for the new quiz type
      const maxOrderQuizType = await QuizType.findOne().sort("-order");
      const newOrder = maxOrderQuizType ? maxOrderQuizType.order + 1 : 0;

      const quizType = new QuizType({
        typeID: uuidv4(),
        typeName,
        order: newOrder,
        createdBy: userId,
      });

      await quizType.save();
      return res
        .status(200)
        .json({ message: "Quiz type added successfully", quizType });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.post("/generate-quiz", async (req, res) => {
  let savedQuiz = null;
  const chapterList = req.body.chapterList || [];
  const bookList = req.body.bookList || [];

  const books = await Book.find({ bookId: { $in: bookList } }).populate();

  const subjectIds = books.map((book) => book.subject);

  const subjects = await Subject.find({ _id: { $in: subjectIds } });
  const subjectNames = subjects.map((subject) => subject.subjectName);
  const uniqueSubjectNames = new Set(subjectNames);
  console.log(uniqueSubjectNames);

  let subject;
  if (uniqueSubjectNames.size === 1) {
    // If the length of the set is 1, use the single unique book name
    subject = Array.from(uniqueSubjectNames)[0];
  } else if (uniqueSubjectNames.size > 1) {
    // If there are multiple unique names, set the subject to "mixed"
    subject = "Mixed";
  }

  try {
    const { quizName, description, isPrivate, quizTypes } = req.body;
    const createdBy = req.headers["user-id"]; // Assuming user ID is sent via headers

    // Log received request data
    console.log("Received Request Data:");
    console.log("Quiz Name:", quizName);
    console.log("Description:", description);
    console.log("Chapter List:", chapterList);
    console.log("Is Private:", isPrivate);
    console.log("Quiz Types:", quizTypes);
    console.log("Created By:", createdBy);

    // Create the main quiz but do not save it yet
    const newQuiz = new Quiz({
      quizName,
      description,
      chapterList,
      isPrivate,
      createdBy,
      subject,
    });

    // Save the quiz
    savedQuiz = await newQuiz.save();
    console.log("Saved Quiz ID:", savedQuiz._id);

    // Iterate over the quiz types and handle each
    for (const quizType of quizTypes) {
      const {
        typeId,
        easyQuestionsCount,
        mediumQuestionsCount,
        hardQuestionsCount,
      } = quizType;

      // Log quiz type details
      console.log("Processing Quiz Type:");
      console.log("Type ID:", typeId);
      console.log("Easy Questions Count:", easyQuestionsCount);
      console.log("Medium Questions Count:", mediumQuestionsCount);
      console.log("Hard Questions Count:", hardQuestionsCount);

      // Validate typeId from QuizType collection
      const quizTypeDoc = await QuizType.findOne({ typeID: typeId }).exec();
      console.log(quizTypeDoc);
      if (!quizTypeDoc) {
        console.error(`Quiz type with ID ${typeId} not found.`);
        throw new Error(`Quiz type with ID ${typeId} not found.`);
      }

      const typeName = quizTypeDoc.typeName.toLowerCase();

      // Call the LLM API to generate questions for each quiz type
      const llmResponse = await postAPI("/create-quiz", {
        pdf_urls: chapterList,
        folder_name: quizName,
        user_id: createdBy,
        question_type: typeName, // Send the lowercase quiz type name
        easy_questions: easyQuestionsCount,
        medium_questions: mediumQuestionsCount,
        hard_questions: hardQuestionsCount,
      });

      // Log the LLM response
      console.log("LLM API Response:");
      console.log(llmResponse);

      const { questions } = llmResponse;

      // Check if questions are defined and is an array
      if (!Array.isArray(questions)) {
        console.error(
          "Unexpected response format. 'questions' is missing or not an array."
        );
        throw new Error("Unexpected response format from LLM API.");
      }

      // Organize questions by difficulty level
      const easyQuestions = questions.filter((q) => q.Difficulty === "easy");
      const mediumQuestions = questions.filter(
        (q) => q.Difficulty === "medium"
      );
      const hardQuestions = questions.filter((q) => q.Difficulty === "hard");

      // Log categorized questions
      console.log("Categorized Questions:");
      console.log("Easy Questions:", easyQuestions);
      console.log("Medium Questions:", mediumQuestions);
      console.log("Hard Questions:", hardQuestions);

      // Save the quiz content for each type
      const newQuizContent = new QuizContent({
        quizID: savedQuiz.quizID, // Link this content to the main quiz
        typeId: typeId, // Store the UUID of the quiz type
        easyQuestionsCount: easyQuestions.length,
        mediumQuestionsCount: mediumQuestions.length,
        hardQuestionsCount: hardQuestions.length,
        generatedQuestions: {
          easy: easyQuestions,
          medium: mediumQuestions,
          hard: hardQuestions,
        },
      });
      // Log the quiz content details
      console.log("Saving Quiz Content:");
      console.log("Quiz ID:", newQuizContent.quizID);
      console.log("Type ID:", newQuizContent.typeId);
      console.log("Easy Questions Count:", newQuizContent.easyQuestionsCount);
      console.log(
        "Medium Questions Count:",
        newQuizContent.mediumQuestionsCount
      );
      console.log("Hard Questions Count:", newQuizContent.hardQuestionsCount);
      console.log("Generated Questions:", newQuizContent.generatedQuestions);

      await newQuizContent.save();
    }

    await Quiz.findByIdAndUpdate(savedQuiz._id, { completedTrue: true });

    await updateUserStats(createdBy);
    // If all operations were successful, respond with the created quiz
    return res.status(201).json({
      message: "Quiz generated successfully",
      quizID: savedQuiz._id,
    });
  } catch (error) {
    console.error("Error generating quiz:", error);

    // Cleanup: Remove the saved quiz if an error occurs
    if (savedQuiz) {
      try {
        await Quiz.deleteOne({ _id: savedQuiz._id });
        console.log("Removed failed quiz:", savedQuiz._id);
      } catch (cleanupError) {
        console.error("Error removing failed quiz:", cleanupError);
      }
    }

    return res.status(500).json({ error: "Server error" });
  }
});

// Get quizzes route with validation
router.get(
  "/get-quizzes",
  [
    header("user-id").notEmpty().withMessage("User ID is required"),
    query("search")
      .optional()
      .isString()
      .withMessage("Search must be a string"),
  ],
  async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const userId = req.headers["user-id"];
      const search = req.query.search || "";

      // Validate if the userId is a valid ObjectId
      if (!ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid User ID format" });
      }

      // Convert userId to ObjectId
      const userObjectId = new ObjectId(userId);

      // Check if the user exists
      const user = await User.findById(userObjectId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create a regex pattern for case-insensitive search
      const searchRegex = new RegExp(search, "i");

      // Fetch quizzes created by the current user (both public and private) and apply search filter
      const userQuizzes = await Quiz.find({
        completedTrue: true,
        createdBy: userObjectId,
        $or: [
          { quizName: { $regex: searchRegex } },
          { description: { $regex: searchRegex } },
        ],
      }).populate("createdBy", "name email");

      // Fetch public quizzes that are not created by the current user and apply search filter
      const publicQuizzes = await Quiz.find({
        isPrivate: false,
        completedTrue: true,
        createdBy: { $ne: userObjectId },
        $or: [
          { quizName: { $regex: searchRegex } },
          { description: { $regex: searchRegex } },
        ],
      }).populate("createdBy", "name email");

      // Respond with both sets of quizzes
      return res.status(200).json({
        userQuizzes,
        publicQuizzes,
      });
    } catch (error) {
      console.error("Error fetching quizzes:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

//get single quiz
router.get(
  "/get-single-quiz",
  [
    header("user-id").notEmpty().withMessage("User ID is required"),
    query("quizId")
      .notEmpty()
      .withMessage("Quiz ID is required")
      .isString()
      .withMessage("Quiz ID must be a string"),
  ],
  async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { quizId } = req.query;
      const userId = req.headers["user-id"];

      // Validate if quizId is a valid UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(quizId)) {
        return res.status(400).json({ message: "Invalid quiz ID format" });
      }

      // Validate if userId is a valid ObjectId
      if (!ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid User ID format" });
      }

      // Convert userId to ObjectId
      const userObjectId = new ObjectId(userId);

      // Check if the user exists
      const user = await User.findById(userObjectId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Find the quiz by quizId
      const quiz = await Quiz.findOne({ quizID: quizId }).populate(
        "createdBy",
        "_id name email"
      );
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      if (!quiz.completedTrue) {
        return res.status(403).json({ message: "Quiz is not yet completed" });
      }

      // Check if the user is authorized to view the quiz
      if (
        quiz.isPrivate &&
        quiz.createdBy._id.toString() !== userObjectId.toString()
      ) {
        return res.status(403).json({
          allow: false,
          message: "You are not authorized to view this quiz",
        });
      }

      return res.status(200).json({
        allow: true,
        message: "Quiz details retrieved successfully",
        quiz,
      });
    } catch (error) {
      console.error("Error retrieving single quiz:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

const generateRandomQuizName = () => {
  return `Quiz_${uuidv4().slice(0, 5)}`;
};

router.post(
  "/quick-quiz",
  upload.array("chapterFiles", 10),
  async (req, res) => {
    try {
      const userId = req.headers["user-id"];

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const chapterFiles = req.files;
      if (!chapterFiles || chapterFiles.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one chapter file is required" });
      }

      if (chapterFiles.length > 10) {
        return res
          .status(400)
          .json({ message: "You cannot upload more than 10 files at a time" });
      }

      const chapterURLs = [];

      for (const file of chapterFiles) {
        const chapterName = path.parse(file.originalname).name;
        const chapterURL = await uploadToAzure(file);
        console.log("File Uploaded: " + chapterName);
        chapterURLs.push(chapterURL);
      }

      // Automatically create the quiz using the uploaded chapter URLs
      const quizName = generateRandomQuizName();
      const newQuiz = new Quiz({
        quizName,
        description: "This is a quick quiz",
        chapterList: chapterURLs,
        isPrivate: true,
        quickQuiz: true,
        createdBy: userId,
        subject: "Quick Quiz",
      });

      const savedQuiz = await newQuiz.save();
      console.log("Saved Quiz ID:", savedQuiz._id);

      // Fetching the typeId of MCQ and Descriptive from the database
      const mcqQuizType = await QuizType.findOne({ typeName: "MCQ" }).exec();
      const descriptiveQuizType = await QuizType.findOne({
        typeName: "Descriptive",
      }).exec();

      if (!mcqQuizType || !descriptiveQuizType) {
        return res.status(500).json({ message: "Quiz types not found!" });
      }

      const quizTypes = [
        {
          typeId: mcqQuizType.typeID,
          easyQuestionsCount: 5,
          mediumQuestionsCount: 3,
          hardQuestionsCount: 2,
        },
        {
          typeId: descriptiveQuizType.typeID,
          easyQuestionsCount: 3,
          mediumQuestionsCount: 2,
          hardQuestionsCount: 1,
        },
      ];

      for (const quizType of quizTypes) {
        const {
          typeId,
          easyQuestionsCount,
          mediumQuestionsCount,
          hardQuestionsCount,
        } = quizType;

        console.log("Processing Quiz Type:", typeId);

        const quizTypeDoc = await QuizType.findOne({ typeID: typeId }).exec();
        if (!quizTypeDoc) {
          return res
            .status(500)
            .json({ message: "Quiz with typeId not found!" });
        }
        const typeName = quizTypeDoc.typeName.toLowerCase();
        console.log(typeName);
        try {
          const llmResponse = await postAPI("/create-quiz", {
            pdf_urls: chapterURLs,
            question_type: typeName,
            easy_questions: easyQuestionsCount,
            medium_questions: mediumQuestionsCount,
            hard_questions: hardQuestionsCount,
          });
          console.log("LLM API Response:", llmResponse);
          const { questions } = llmResponse;
          const easyQuestions = questions.filter(
            (q) => q.Difficulty === "easy"
          );
          const mediumQuestions = questions.filter(
            (q) => q.Difficulty === "medium"
          );
          const hardQuestions = questions.filter(
            (q) => q.Difficulty === "hard"
          );

          if (!Array.isArray(questions)) {
            console.error(
              "Unexpected response format. 'questions' is missing or not an array."
            );
            continue;
          }

          const newQuizContent = new QuizContent({
            quizID: savedQuiz.quizID,
            typeId: typeId,
            easyQuestionsCount: easyQuestionsCount,
            mediumQuestionsCount: mediumQuestionsCount,
            hardQuestionsCount: hardQuestionsCount,
            generatedQuestions: {
              easy: easyQuestions,
              medium: mediumQuestions,
              hard: hardQuestions,
            },
          });

          await newQuizContent.save();
        } catch (error) {
          console.error("Error calling LLM API:", error);
          continue;
        }
      }

      await Quiz.findByIdAndUpdate(savedQuiz._id, { completedTrue: true });

      // Delete chapters from Azure Blob Storage after generating the quiz
      for (const chapterURL of chapterURLs) {
        await deleteBlobFromAzure(chapterURL);
      }
      await updateUserStats(userId);
      return res.status(201).json({
        message: "Quiz generated successfully and chapters deleted",
        quizID: savedQuiz.quizID,
      });
    } catch (error) {
      console.error("Error generating quiz:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// Get chapter details by quiz ID route with validation
router.get(
  "/get-chapter-details-by-quiz",
  [
    query("quizID")
      .notEmpty()
      .withMessage("Quiz ID is required")
      .isString()
      .withMessage("Quiz ID must be a string"),
  ],
  async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { quizID } = req.query;

      // Validate if quizID is a valid UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(quizID)) {
        return res.status(400).json({ message: "Invalid quiz ID format" });
      }

      // Find the quiz by quizID
      const quiz = await Quiz.findOne({ quizID });
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      // Extract the chapterList (URLs) from the quiz
      const { chapterList } = quiz;

      // Array to store chapter details
      const chapterDetails = [];

      // Fetch details for each chapter URL
      for (const chapterURL of chapterList) {
        const chapter = await Chapter.findOne({ chapterURL });

        if (chapter) {
          chapterDetails.push({
            chapterName: chapter.chapterName,
            description: chapter.description,
            chapterURL: chapter.chapterURL,
          });
        } else {
          continue;
        }
      }

      // Return the chapter details
      return res.status(200).json({
        quizID,
        chapterDetails,
      });
    } catch (error) {
      console.error("Error fetching chapter details:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// Toggle quiz privacy route with validation
router.post(
  "/toggle-quiz-privacy",
  [
    header("user-id")
      .notEmpty()
      .withMessage("User ID is required")
      .isString()
      .withMessage("User ID must be a string"),
    query("quizId")
      .notEmpty()
      .withMessage("Quiz ID is required")
      .isString()
      .withMessage("Quiz ID must be a string"),
  ],
  async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const userId = req.headers["user-id"];
      const { quizId } = req.query;

      // Validate if quizId is a valid UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(quizId)) {
        return res.status(400).json({ message: "Invalid quiz ID format" });
      }

      // Check if the user exists in the database
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Find the quiz by quizId
      const quiz = await Quiz.findOne({ quizID: quizId });
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      // Check if the user is the owner of the quiz
      if (quiz.createdBy.toString() !== userId) {
        return res
          .status(403)
          .json({ message: "You are not authorized to modify this quiz" });
      }

      // Toggle the privacy setting
      quiz.isPrivate = !quiz.isPrivate;

      // Save the updated quiz
      await quiz.save();
      await updateUserStats(userId);

      return res.status(200).json({
        message: `Your quiz is now ${quiz.isPrivate ? "Private" : "Public"}`,
        isPrivate: quiz.isPrivate,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

router.post(
  "/delete-quiz",
  [
    header("user-id")
      .notEmpty()
      .withMessage("User ID is required")
      .isString()
      .withMessage("User ID must be a string"),
    query("quizID")
      .notEmpty()
      .withMessage("Quiz ID is required")
      .isString()
      .withMessage("Quiz ID must be a string"),
  ],
  async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const userId = req.headers["user-id"];
      const { quizID } = req.query;

      // Validate if quizID is a valid UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(quizID)) {
        return res.status(400).json({ message: "Invalid quiz ID format" });
      }

      // Check if the user exists in the database
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Find the quiz by quizID
      const quiz = await Quiz.findOne({ quizID });
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      // Check if the user is the owner of the quiz
      if (quiz.createdBy.toString() !== userId) {
        return res
          .status(403)
          .json({ message: "You are not authorized to delete this quiz" });
      }

      // Find all quiz content associated with the quiz
      const quizContents = await QuizContent.find({ quizID });

      // Delete each content file from Azure Blob Storage if necessary
      for (const content of quizContents) {
        if (content.fileURL) {
          await deleteBlobFromAzure(content.fileURL);
        }
      }

      // Delete the quiz content entries
      const deletedQuizContents = await QuizContent.deleteMany({ quizID });

      // Delete the quiz
      await Quiz.deleteOne({ quizID });
      await updateUserStats(userId);

      return res.status(200).json({
        message: "Quiz deleted successfully",
        deletedQuizContents: deletedQuizContents.deletedCount,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

router.get(
  "/getTemplate",
  [
    query("quizId")
      .notEmpty()
      .withMessage("Quiz ID is required")
      .isString()
      .withMessage("Quiz ID must be a string")
      .matches(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
      )
      .withMessage("Invalid Quiz ID format"),
  ],
  async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { quizId } = req.query;

      // Find all quiz content documents with the specified quizId
      const quizContents = await QuizContent.find({ quizID: quizId });

      if (!quizContents || quizContents.length === 0) {
        return res
          .status(404)
          .json({ message: "No quiz content found for the given quizId" });
      }

      // Prepare an object to store all questions categorized by type
      const allQuestionsByType = {};

      quizContents.forEach((content) => {
        const { generatedQuestions, typeId } = content;

        // Check if generatedQuestions exists and is not empty
        if (generatedQuestions) {
          const types = ["easy", "medium", "hard"];
          types.forEach((level) => {
            if (generatedQuestions[level]) {
              generatedQuestions[level].forEach((question) => {
                // Initialize the array for this typeId if it doesn't exist
                if (!allQuestionsByType[typeId]) {
                  allQuestionsByType[typeId] = [];
                }

                // Add question details to the respective typeId array
                const questionObj = {
                  Question: question.Questions,
                  difficulty: level,
                  answer: question.Answer,
                  explanation: question.Explanation,
                };

                // Add options if they exist (e.g., for MCQs)
                if (question.Options) {
                  questionObj.options = question.Options;
                }

                allQuestionsByType[typeId].push(questionObj);
              });
            }
          });
        }
      });

      // Prepare the final output structure with dynamic type names
      const finalResponse = [];

      for (const [typeId, questions] of Object.entries(allQuestionsByType)) {
        const type = await QuizType.findOne({ typeID: typeId });

        if (!type) return res.status(404).json({ message: "Type not found!" });

        finalResponse.push({ [type.typeName]: questions });
      }

      return res.json({ template: finalResponse });
    } catch (error) {
      console.error("Error fetching quiz template:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

router.get(
  "/quiz-content",
  [
    query("quizID")
      .notEmpty()
      .withMessage("quizID is required")
      .isString()
      .withMessage("quizID must be a string")
      .matches(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
      )
      .withMessage("Invalid quizID format"),
  ],
  async (req, res) => {
    // Validate request inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quizID } = req.query;

    try {
      // Fetch quiz content from the database
      const quizContent = await QuizContent.findOne({ quizID });

      // Check if quiz content exists
      if (!quizContent) {
        return res.status(404).json({ message: "Quiz content not found" });
      }

      // Return the quiz content
      return res.json(quizContent);
    } catch (error) {
      console.error("Error fetching quiz content:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post("/submit-quiz", async (req, res) => {
  const { questions } = req.body;
  const { quizID } = req.query;
  const userId = req.headers["user-id"];

  if (!quizID || !questions || !userId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // Dynamically fetch the typeIds for MCQ, Descriptive, and Numerical from the QuizType collection
    const quizTypes = await QuizType.find({
      typeName: { $in: ["MCQ", "Descriptive", "Numerical"] },
    });

    // Create a mapping of typeName to typeId for easier reference
    const typeIdMap = {};
    quizTypes.forEach((type) => {
      typeIdMap[type.typeName] = type.typeID;
    });
    const typeID1 = typeIdMap["MCQ"];
    const typeID2 = typeIdMap["Descriptive"];
    const typeID3 = typeIdMap["Numerical"];
    console.log("typeId1", typeID1);
    const quizContent = await QuizContent.find({ quizID });

    const foundQuizContentmcq = quizContent.find(
      (item) => item.typeId === typeID1
    );
    const foundQuizContentDesc = quizContent.find(
      (item) => item.typeId === typeID2
    );
    const foundQuizContentNum = quizContent.find(
      (item) => item.typeId === typeID3
    );

    if (!foundQuizContentmcq && !foundQuizContentDesc && !foundQuizContentNum) {
      return res.status(404).json({ message: "Quiz content not found" });
    }

    let mcqScore = 0;
    let descriptiveScore = 0;
    let numericalScore = 0;

    let mcqTotalMarks = 0;
    let descriptiveTotalMarks = 0;
    let numericalTotalMarks = 0;

    const MCQS = [];
    const DESCRIPTIVE = [];
    const NUMERICAL = [];

    // Process MCQ Questions
    if (questions.MCQ) {
      for (const mcq of questions.MCQ) {
        const questionData = foundQuizContentmcq.generatedQuestions[
          mcq.difficulty
        ].find((q) => q.Questions === mcq.Question);
        if (!questionData)
          return res
            .status(400)
            .json({ message: "Question not found in quiz content" });

        const { Answer: correctAnswer, Difficulty } = questionData;
        let score = 0;
        if (correctAnswer === mcq.userAnswer) {
          if (Difficulty === "easy") score = 1;
          else if (Difficulty === "medium") score = 3;
          else if (Difficulty === "hard") score = 5;
        }

        mcqScore += score;

        if (Difficulty === "easy") mcqTotalMarks += 1;
        else if (Difficulty === "medium") mcqTotalMarks += 3;
        else if (Difficulty === "hard") mcqTotalMarks += 5;

        MCQS.push({
          question: mcq.Question,
          userAnswer: mcq.userAnswer,
          correctAnswer: correctAnswer,
          difficulty: mcq.difficulty,
          score: score,
        });
      }
    }

    // Process Descriptive Questions
    if (questions.Descriptive) {
      for (const desc of questions.Descriptive) {
        const llmRequest = {
          question: desc.Question,
          correct_answer: "",
          user_answer: desc.userAnswer,
          question_type: 1,
          difficulty: desc.difficulty,
        };

        try {
          const response = await postAPI("/feedback", llmRequest); // Replace with actual LLM endpoint
          const { score: llmScore, feedback } = response;
          const correctAnswerForDescriptive =
            foundQuizContentDesc.generatedQuestions[desc.difficulty].find(
              (q) => q.Questions === desc.Question
            )?.Answer;

          let score = 0;
          let maxScore = 0;

          if (desc.difficulty === "easy") {
            score = (3 * llmScore) / 100;
            maxScore = 3;
          } else if (desc.difficulty === "medium") {
            score = (5 * llmScore) / 100;
            maxScore = 5;
          } else if (desc.difficulty === "hard") {
            score = (10 * llmScore) / 100;
            maxScore = 10;
          }

          descriptiveScore += score;
          descriptiveTotalMarks += maxScore;
          DESCRIPTIVE.push({
            question: desc.Question,
            userAnswer: desc.userAnswer,
            correctAnswer: correctAnswerForDescriptive,
            feedback: feedback,
            difficulty: desc.difficulty,
            score: score,
          });
        } catch (error) {
          console.error("Error contacting LLM:", error);
          return res
            .status(500)
            .json({ message: "Error evaluating descriptive questions" });
        }
      }
    }

    // Process Numerical Questions
    if (questions.Numerical) {
      for (const num of questions.Numerical) {
        const correctAnswerForNumerical =
          foundQuizContentNum.generatedQuestions[num.difficulty].find(
            (q) => q.Questions === num.Question
          )?.Answer;

        const llmRequest = {
          question: num.Question,
          correct_answer: correctAnswerForNumerical,
          user_answer: num.userAnswer,
          question_type: 2, // Assuming 2 is for numerical questions
          difficulty: num.difficulty,
        };
        try {
          const response = await postAPI("/feedback", llmRequest); // Replace with actual LLM endpoint
          const { score: llmScore, feedback } = response;

          let score = 0;
          let maxScore = 0;

          if (num.difficulty === "easy") {
            score = (3 * llmScore) / 100;
            maxScore = 3;
          } else if (num.difficulty === "medium") {
            score = (5 * llmScore) / 100;
            maxScore = 5;
          } else if (num.difficulty === "hard") {
            score = (10 * llmScore) / 100;
            maxScore = 10;
          }

          numericalScore += score;
          numericalTotalMarks += maxScore;

          NUMERICAL.push({
            question: num.Question,
            userAnswer: num.userAnswer,
            correctAnswer: correctAnswerForNumerical,
            feedback: feedback,
            difficulty: num.difficulty,
            score: score,
          });
        } catch (error) {
          console.error("Error contacting LLM:", error);
          return res
            .status(500)
            .json({ message: "Error evaluating numerical questions" });
        }
      }
    }

    // Calculate percentages
    const mcqPercentage = (mcqScore / mcqTotalMarks) * 100 || 0;
    const descriptivePercentage =
      (descriptiveScore / descriptiveTotalMarks) * 100 || 0;
    const numericalPercentage =
      (numericalScore / numericalTotalMarks) * 100 || 0;

    // Calculate total percentage based on the total possible marks
    const totalMarks =
      mcqTotalMarks + descriptiveTotalMarks + numericalTotalMarks;
    const totalScore = mcqScore + descriptiveScore + numericalScore;
    const totalPercentage = (totalScore / totalMarks) * 100 || 0;

    let grade;
    switch (true) {
      case totalPercentage > 90:
        grade = "O";
        break;
      case totalPercentage > 80:
        grade = "A+";
        break;
      case totalPercentage > 70:
        grade = "A";
        break;
      case totalPercentage > 60:
        grade = "B+";
        break;
      case totalPercentage > 50:
        grade = "B";
        break;
      case totalPercentage > 40:
        grade = "C";
        break;
      case totalPercentage > 30:
        grade = "D";
        break;
      default:
        grade = "F";
        break;
    }
    
    // Log the grade to debug
    console.log("Grade:", grade);
    
    // Find or create a StudentMarks entry
    let studentMarks = await StudentMarks.findOne({ userId, quizId: quizID });
    
    if (studentMarks) {
      // Update the existing document
      studentMarks.mcqPercentage = mcqPercentage;
      studentMarks.descriptivePercentage = descriptivePercentage;
      studentMarks.numericalPercentage = numericalPercentage;
      studentMarks.totalPercentage = totalPercentage;
      studentMarks.grade = grade;
    } else {
      // Create a new document
      studentMarks = new StudentMarks({
        userId,
        quizId: quizID,
        mcqPercentage,
        descriptivePercentage,
        numericalPercentage,
        totalPercentage,
        grade,
      });
    }
    
    await studentMarks.save();
    

    // Send response
    return res.json({
      MCQS,
      DESCRIPTIVE,
      NUMERICAL,
      mcqScore,
      mcqPercentage,
      descriptiveScore,
      descriptivePercentage,
      numericalScore,
      numericalPercentage,
      totalScore,
      totalPercentage,
      mcqTotalMarks,
      descriptiveTotalMarks,
      numericalTotalMarks,
      totalMarks,
      grade,
    });
  } catch (error) {
    console.error("Error processing quiz submission:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
