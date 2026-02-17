const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../utils/dbConnect");
const authMiddleware = require("../middleware/auth.middleware");
require("dotenv").config();

const route = express.Router();
route.use(express.json());

route.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Please enter all fields" });
  }

  try {
    const [users] = await query("SELECT id FROM users WHERE email = ?", [email]);
    if (users.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await query("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashedPassword]);

    res.status(201).json({ msg: "User registered successfully", userId: result.insertId });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

route.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Please enter all fields" });
  }

  try {
    const [users] = await query("SELECT * FROM users WHERE email = ?", [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const payload = { user: { id: user.id } };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: { id: user.id, email: user.email, generation_count: user.generation_count },
        });
      }
    );
  } catch (err) {
    res.status(500).send("Server error");
  }
});

route.get("/me", authMiddleware, async (req, res) => {
  try {
    const [users] = await query("SELECT id, email, generation_count FROM users WHERE id = ?", [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(users[0]);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = route;