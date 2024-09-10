const express = require("express");
const router = express.Router();
const Subject = require("../models/SubjectModel");

const { verifyTokenMiddleware } = require("../middlewares/jwtVerifier");

router.use(verifyTokenMiddleware);

// Route to get all subjects
router.get("/get-subjects", async (req, res) => {
  try {
    // Fetch subjects from the database with optional search filter
    const subjects = await Subject.find({});

    // Return the list of subjects
    return res.status(200).json({ subjects });
  } catch (error) {
    console.error("Error fetching subjects:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
