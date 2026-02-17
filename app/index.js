require("dotenv").config();
const express = require("express");
const routes = require("../routes");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const { PORT = 7645 } = process.env;
const sitemap = require("../sitemap.js");
const path = require("path");

app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms")
);
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json());
app.use("/", routes);
app.use(express.static(path.join(__dirname, "./../dist")));
app.use("/uploads", express.static(path.join(__dirname, "./../uploads")));
app.use("/sitemap.xml", sitemap);
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./../dist/index.html"));
});

app.listen(PORT, () => {
  console.log("Listening on PORT", PORT);
});
