const { postAPI } = require("../utils/axiosURI");
const express = require("express");
const router = express.Router();
const Book = require("../models/Book"); // Assuming the Book model is in a 'models' directory

const { verifyTokenMiddleware } = require("../middlewares/jwtVerifier");
const { body, header, validationResult, query } = require("express-validator");
router.use(verifyTokenMiddleware);

router.post(
  "/initialiseChatBot",
  [
    query("bookId")
      .notEmpty()
      .withMessage("Book ID is required")
      .isString()
      .withMessage("Invalid Book ID format")
      .matches(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
      )
      .withMessage("Invalid Book ID format"),
  ],
  async (req, res) => {
    try {
      // Validate request inputs
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const { bookId } = req.query;

      if (!bookId) {
        return res.status(400).json({ message: "Book ID is required" });
      }

      // Fetch the book by bookId
      const book = await Book.findOne({ bookId });

      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }

      const { embFile, embeddingLink } = book;

      if (!embFile || !embeddingLink) {
        return res
          .status(400)
          .json({ message: "Book does not have embedding information" });
      }

      // Prepare the request payload for FastAPI
      const payload = {
        foldername: embFile,
        blob_url: embeddingLink,
      };

      // Call the FastAPI route
      const response = await postAPI("/initial-chatbot", payload);

      console.log("the response from the fast api--->>>", response);

      // Return a success message
      if (response) {
        console.log("ChatBot Initialised");
        return res
          .status(200)
          .json({ message: "ChatBot initialized successfully" });
      }
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  }
);

router.get(
  "/queryChatBot",
  [
    // Validation rules
    query("bookId")
      .notEmpty()
      .withMessage("Book ID is required")
      .isString()
      .withMessage("Invalid Book ID format")
      .matches(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
      )
      .withMessage("Invalid Book ID format"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { bookId, query } = req.query;

      // Fetch the book by bookId
      const book = await Book.findOne({ bookId });

      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }

      const { embFile } = book;

      if (!embFile) {
        return res
          .status(400)
          .json({ message: "Book does not have embedding information" });
      }

      // Prepare the request payload for FastAPI
      const payload = {
        foldername: embFile,
        query: query,
      };

      console.log("Sending payload to FastAPI:", payload);

      // Call the FastAPI route
      const response = await postAPI("/query-chatbot", payload);

      // Log the response for debugging

      // Return the bot's answer
      return res.status(200).json({
        message: "Query processed successfully",
        bot_answer: response.bot_answer,
      });
    } catch (error) {
      console.error("Caught an error:", error);
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  }
);
module.exports = router;
