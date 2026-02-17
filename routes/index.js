const express = require("express");
const app = express();

const uploadRoutes = require("./upload.routes.js");
const authRoutes = require("./auth.routes.js");
const sessionRoutes = require("./sessions.routes.js");
const statsRoutes = require("./stats.routes.js");

app.use("/api/upload", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/stats", statsRoutes);

module.exports = app;
