// routes/bookRoutes.js
const express = require("express");
const multer = require("multer");
const Book = require("../models/Book");
const User = require("../models/User");
const Chapter = require("../models/Chapter");
const Subject = require("../models/SubjectModel");
const { body, header, validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");
const {
  uploadToAzure,
  deleteBlobFromAzure,
} = require("../utils/azureFunctions");
const router = express.Router();
const { updateUserStats } = require("../middlewares/userStatsUpdate");

const { verifyTokenMiddleware } = require("../middlewares/jwtVerifier");

router.use(verifyTokenMiddleware);

// Set up Multer for file uploads
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage: storage });

// Route to add a book with image upload
router.post(
  "/add-book",
  upload.single("coverImage"),
  // Validation rules
  [
    header("user-id").notEmpty().withMessage("User ID is required"),
    body("name").notEmpty().withMessage("Book name is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("subjectName").notEmpty().withMessage("Subject name is required"),
    body("private")
      .optional()
      .isBoolean()
      .withMessage("Private must be a boolean value"),
    body("coverImage").custom((value, { req }) => {
      if (!req.file) {
        throw new Error("Cover image is required");
      }
      return true;
    }),
  ],
  // Route handler
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, description, private, subjectName } = req.body;
      const userId = req.headers["user-id"]; // Get user ID from headers

      // Verify if the user exists in the database
      const userExists = await User.findById(userId);
      if (!userExists) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if the subject already exists or create a new one
      let subjectDoc = await Subject.findOne({
        subjectName: subjectName.toUpperCase().trim(),
      });
      if (!subjectDoc) {
        subjectDoc = new Subject({
          subjectName: subjectName.toUpperCase().trim(),
        });
        await subjectDoc.save();
      }

      // Upload cover image to Azure Blob Storage
      const coverImageUrl = await uploadToAzure(req.file);

      // Create a new book instance
      const newBook = new Book({
        name,
        description,
        coverImage: coverImageUrl, // Store the Azure Blob URL
        bookId: uuidv4(), // Generate a unique bookId
        private: private || false,
        user: userId,
        subject: subjectDoc._id, // Store the subject ID
      });

      await newBook.save();
      await updateUserStats(userId);

      return res.status(201).json({
        message: "Book and subject added successfully",
        book: newBook,
      });
    } catch (error) {
      console.error("Error adding book:", error);
      return res.status(500).json({ message: "Couldn't add book" });
    }
  }
);

// Route to get books with optional search
router.get("/get-books",[], async (req, res) => {
  try {
    const userId = req.headers["user-id"];
    const search = req.query.search || ""; // Get the search query parameter

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Create a regex pattern for case-insensitive search
    const searchRegex = new RegExp(search, "i");

    // Fetch books created by the current user (both private and public) and apply search filter
    const userBooks = await Book.find({
      user: userId,
      $or: [
        { name: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
      ],
    }).populate("user", "name email");

    // Fetch public books that are not created by the current user and apply search filter
    const publicBooks = await Book.find({
      private: false,
      user: { $ne: userId },
      $or: [
        { name: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
      ],
    }).populate("user", "name email");

    // Respond with both sets of books
    return res.status(200).json({
      userBooks,
      publicBooks,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Route to toggle book privacy
router.post("/toggle-book-privacy", async (req, res) => {
  try {
    const userId = req.headers["user-id"];
    const { bookId } = req.query; // Get book ID from query parameters

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!bookId) {
      return res.status(400).json({ message: "Book ID is required" });
    }

    // Validate if bookId is a valid UUID (assuming it's a UUID and not MongoDB ObjectId)
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(bookId)) {
      return res.status(400).json({ message: "Invalid book ID format" });
    }

    // Find the book by bookId
    const book = await Book.findOne({ bookId });
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Check if the user is the owner of the book
    if (book.user._id.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to modify this book" });
    }

    // Toggle the privacy setting
    book.private = !book.private;

    // Save the updated book
    await book.save();
    await updateUserStats(userId);

    return res.status(200).json({
      message: `Your book is now ${book.private ? "Private" : "Public"}`,
      private: book.private,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Route to get a specific book by ID
router.get("/get-book", async (req, res) => {
  try {
    const { bookId } = req.query;
    const userId = req.headers["user-id"];

    if (!bookId) {
      return res.status(400).json({ message: "Book ID is required" });
    }

    // Validate if bookId is a valid UUID
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(bookId)) {
      return res.status(400).json({ message: "Invalid book ID format" });
    }

    // Find the book by bookId
    const book = await Book.findOne({ bookId })
      .populate("user", "_id name email")
      .populate("subject", "subjectName"); // Populate the subject field

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Check if the user is authorized to view the `book`
    if (book.private && book.user._id.toString() !== userId) {
      return res.status(403).json({
        allow: false,
        message: "You are not authorized to view this book",
      });
    }

    return res.status(200).json({
      allow: true,
      message: "Book details retrieved successfully",
      book: book,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Route to delete a book and its associated chapters
router.post("/delete-book", async (req, res) => {
  try {
    const userId = req.headers["user-id"];
    const { bookId } = req.query; // Get book ID from query parameters

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!bookId) {
      return res.status(400).json({ message: "Book ID is required" });
    }

    // Validate if bookId is a valid UUID
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(bookId)) {
      return res.status(400).json({ message: "Invalid book ID format" });
    }

    // Find the book by bookId
    const book = await Book.findOne({ bookId });
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Check if the user is the owner of the book
    if (book.user._id.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this book" });
    }

    // Delete the associated chapters
    const chapters = await Chapter.find({ book: book._id });
    for (let chapter of chapters) {
      await deleteBlobFromAzure(chapter.chapterURL); // Delete chapter files from Azure
      await chapter.deleteOne(); // Delete chapter record from the database
    }

    // Delete the book cover image from Azure
    await deleteBlobFromAzure(book.coverImage);

    // Delete the book from the database
    await book.deleteOne();

    await updateUserStats(userId);
    return res.status(200).json({
      message: "Book and associated chapters deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
