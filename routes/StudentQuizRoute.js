const express = require("express");
const router = express.Router();
const QuizContent = require("../models/QuizContent");
const QuizType = require("../models/QuizType");
const { query, validationResult } = require("express-validator");
// Route to get the quiz content for the student
const { verifyTokenMiddleware } = require("../middlewares/jwtVerifier");

router.use(verifyTokenMiddleware);

router.get(
  "/get-student-quiz",
  [
    query("quizId")
      .notEmpty()
      .withMessage("Quiz ID is required")
      .matches(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
      )
      .withMessage("Quiz ID must be a valid UUID"),
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
      console.error("Error fetching student quiz template:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

module.exports = router;
