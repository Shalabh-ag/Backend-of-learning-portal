const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const multer = require("multer");
const Chapter = require("../models/Chapter");
const Book = require("../models/Book");
const { body, header, validationResult, query } = require("express-validator");
const {
  uploadToAzure,
  deleteBlobFromAzure,
} = require("../utils/azureFunctions"); // Import utility functions
require("dotenv").config();
const { postAPI } = require("../utils/axiosURI");

const router = express.Router();
const { verifyTokenMiddleware } = require("../middlewares/jwtVerifier");

router.use(verifyTokenMiddleware);

// Multer setup for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const updateEmbeddings = async (book) => {
  try {
    // Check if the book has chapters
    if (!book.chapters || book.chapters.length === 0) {
      throw new Error("No chapters found for the book.");
    }

    // Fetch the chapters associated with the book
    const chapters = await Chapter.find({ _id: { $in: book.chapters } });

    console.log(chapters);

    if (!chapters || chapters.length === 0) {
      throw new Error("No valid chapters found for the book.");
    }

    // Extract the URLs from the chapters
    const pdfLinks = chapters.map((chapter) => chapter.chapterURL);

    console.log("here are the pdflinks : ", pdfLinks);

    if (!pdfLinks || pdfLinks.length === 0) {
      throw new Error("No chapter URLs available.");
    }

    // Generate a random folder name using book name and UUID
    const folderName = `${book.name}_${uuidv4()}`;

    // Prepare the request payload for the /create-embeddings API
    const payload = {
      pdf_links: pdfLinks,
      folder_name: folderName,
      existing_embedding_links: book.embeddingLink ? [book.embeddingLink] : [],
    };

    // Call the /create-embeddings API using postAPI
    const response = await postAPI("/create-embeddings", payload);

    if (!response || !response.Embedding_links) {
      throw new Error("Failed to create embeddings.");
    }

    // Update the book with the new embedding link and file
    book.embeddingLink = response.Embedding_links;
    book.embFile = folderName;

    // Save the updated book document
    await book.save();

    return book;
  } catch (error) {
    throw new Error(error.message);
  }
};

// Route for uploading multiple chapters

// Middleware for checking PDF file types
const checkFileType = (file) => {
  const allowedTypes = ["application/pdf"];
  return allowedTypes.includes(file.mimetype);
};

router.post(
  "/upload-chapters",
  // Validation rules
  [
    header("user-id")
      .notEmpty()
      .withMessage("User ID is required")
      .isString()
      .isLength({ min: 1 })
      .withMessage("Invalid User ID format"),
    query("bookId")
      .notEmpty()
      .withMessage("Book ID is required")
      .isString()
      .isLength({ min: 1 })
      .withMessage("Invalid Book ID format"),
    body("chapterFiles").custom((value, { req }) => {
      if (!req.files || req.files.length === 0) {
        throw new Error("At least one chapter file is required");
      }
      if (req.files.length > 10) {
        throw new Error("You cannot upload more than 10 files at a time");
      }
      if (!req.files.every((file) => checkFileType(file))) {
        throw new Error("Only PDF files are allowed");
      }
      return true;
    }),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.headers["user-id"];
      const { bookId } = req.query;

      // Verify if the user exists
      const userExists = await User.findById(userId);
      if (!userExists) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate if the book exists and user is authorized
      const book = await Book.findOne({ bookId });
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }

      if (book.user._id.toString() !== userId) {
        return res.status(403).json({
          message: "You are not authorized to upload chapters to this book",
        });
      }

      const chapterFiles = req.files;
      const newChapters = [];

      for (const file of chapterFiles) {
        const chapterName = path.parse(file.originalname).name;
        const chapterURL = await uploadToAzure(file);

        const newChapter = new Chapter({
          chapterName,
          chapterURL,
          chapterId: uuidv4(),
          book: book._id,
        });

        await newChapter.save();
        newChapters.push(newChapter);
        book.chapters.push(newChapter._id);
      }

      await book.save();
      await updateEmbeddings(book);

      return res.status(201).json({
        message: "Chapters uploaded successfully",
        chapters: newChapters,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Server error, could not upload chapters!" });
    }
  }
);

// Route to get all chapters of a book

// Middleware for validation and checks
router.get(
  "/getallchapters",
  [
    header("user-id")
      .notEmpty()
      .withMessage("User ID is required")
      .isString()
      .isLength({ min: 1 })
      .withMessage("Invalid User ID format"),
    query("bookId")
      .notEmpty()
      .withMessage("Book ID is required")
      .isString()
      .isLength({ min: 1 })
      .withMessage("Invalid Book ID format"),
    query("search")
      .optional()
      .isString()
      .withMessage("Search term must be a string"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.headers["user-id"];
      const { bookId, search = "" } = req.query;

      // Validate if bookId is a valid UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(bookId)) {
        return res.status(400).json({ message: "Invalid book ID format" });
      }

      // Verify if the user exists
      const userExists = await User.findById(userId);
      if (!userExists) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch the book and its chapters
      const book = await Book.findOne({ bookId }).populate({
        path: "chapters",
        match: { chapterName: { $regex: new RegExp(search, "i") } },
        select: "chapterId chapterName chapterURL",
      });

      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }

      // Check if the user is authorized to view the book's chapters
      if (book.private && book.user._id.toString() !== userId) {
        return res.status(403).json({
          allow: false,
          message: "You are not authorized to view the chapters of this book",
        });
      }

      return res.status(200).json({
        allow: true,
        message: "Chapters retrieved successfully",
        chapters: book.chapters,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// Route to delete a chapter
router.post(
  "/delete-chapter",
  [
    // Validation rules
    header("user-id")
      .notEmpty()
      .withMessage("User ID is required")
      .isString()
      .withMessage("Invalid User ID format"),
    query("chapterId")
      .notEmpty()
      .withMessage("Chapter ID is required")
      .isString()
      .withMessage("Invalid Chapter ID format")
      .matches(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
      )
      .withMessage("Invalid Chapter ID format"),
  ],
  async (req, res) => {
    try {
      // Validate request inputs
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.headers["user-id"];
      const { chapterId } = req.query;

      // Check if the user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Find the chapter
      const chapter = await Chapter.findOne({ chapterId });
      if (!chapter) {
        return res.status(404).json({ message: "Chapter not found" });
      }

      // Find the associated book
      const book = await Book.findById(chapter.book);
      if (!book) {
        return res.status(404).json({ message: "Associated book not found" });
      }

      // Check if the user is the owner of the book
      if (book.user._id.toString() !== userId) {
        return res
          .status(403)
          .json({ message: "You are not authorized to delete this chapter" });
      }

      // Delete the chapter
      await deleteBlobFromAzure(chapter.chapterURL);
      await Chapter.findOneAndDelete({ chapterId });

      // Update the book's chapters list
      await Book.findByIdAndUpdate(
        chapter.book,
        { $pull: { chapters: chapter._id } },
        { new: true }
      );

      await updateEmbeddings(book);

      return res.status(200).json({ message: "Chapter deleted successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
