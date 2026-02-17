const express = require("express");
const { query } = require("../utils/dbConnect");

const route = express.Router();

route.get("/", async (req, res) => {
  try {
    const sql = `
      SELECT
        gq.model,
        COUNT(gq.id) AS totalQuestions,
        
        SUM(CASE WHEN gq.type = 'multiple-choice' THEN 1 ELSE 0 END) AS multipleChoiceCount,
        SUM(CASE WHEN gq.type = 'essay' THEN 1 ELSE 0 END) AS essayCount,
        SUM(CASE WHEN gq.type = 'true-false' THEN 1 ELSE 0 END) AS trueFalseCount,
        SUM(CASE WHEN gq.type = 'fill-in-the-blank' THEN 1 ELSE 0 END) AS fillInTheBlankCount,
        
        MAX(CAST(gq.confidence AS DECIMAL(10,4))) AS maxConfidence,
        MIN(CAST(gq.confidence AS DECIMAL(10,4))) AS minConfidence,
        AVG(CAST(gq.confidence AS DECIMAL(10,4))) AS avgConfidence,
        
        MIN(CAST(gl.duration AS DECIMAL(10,2))) AS minDuration,
        MAX(CAST(gl.duration AS DECIMAL(10,2))) AS maxDuration,
        AVG(CAST(gl.duration AS DECIMAL(10,2))) AS avgDuration
      FROM
        generated_questions gq
      JOIN
        generation_logs gl ON gq.log_id = gl.id
      GROUP BY
        gq.model
    `;
    const [stats] = await query(sql);
    res.json(stats);
  } catch (err) {
    console.error("Error fetching global stats:", err);
    res.status(500).send("Server Error");
  }
});

module.exports = route;
