const express = require("express");
const { query } = require("../utils/dbConnect");
const authMiddleware = require("../middleware/auth.middleware");

const route = express.Router();

route.get("/", authMiddleware, async (req, res) => {
  try {
    const sql = `
      SELECT
        gs.id AS session_uuid, gs.user_id, gs.title, gs.model AS session_model, gs.created_at, gs.filename,
        gl.id as log_id, gl.template_id, gl.duration as ai_duration, gl.pages, 
        gl.input_tokens, gl.output_tokens, gl.total_tokens, gl.question_count, gl.created_at as log_created_at,
        gq.id, gq.type, gq.difficulty, gq.confidence, gq.model AS question_model,
        gq.question, gq.options, gq.answer, gq.explanation, gq.source_text,
        gq.keywords, gq.duration, gq.language, gq.source,
        pt.template_text
      FROM
        generation_sessions gs
      LEFT JOIN
        generation_logs gl ON gs.id = gl.session_id
      LEFT JOIN
        generated_questions gq ON gl.id = gq.log_id
      LEFT JOIN
        prompt_templates pt ON gl.template_id = pt.id
      WHERE
        gs.user_id = ?
      ORDER BY
        gs.created_at DESC, gl.id ASC, gq.id ASC
    `;

    const [rows] = await query(sql, [req.user.id]);
    const sessionsMap = new Map();

    rows.forEach((row) => {
      // 1. Get or create the session
      let session = sessionsMap.get(row.session_uuid);
      if (!session) {
        session = {
          id: row.session_uuid,
          user_id: row.user_id,
          title: row.title,
          model: row.session_model,
          created_at: row.created_at,
          filename: row.filename,
          logs: new Map(), // Use a Map to store logs to avoid duplicates
        };
        sessionsMap.set(row.session_uuid, session);
      }

      // 2. Get or create the log if it exists
      if (row.log_id) {
        let log = session.logs.get(row.log_id);
        if (!log) {
          log = {
            id: row.log_id,
            duration: row.ai_duration,
            pages: row.pages,
            input_tokens: row.input_tokens,
            output_tokens: row.output_tokens,
            total_tokens: row.total_tokens,
            question_count: row.question_count,
            created_at: row.log_created_at,
            template_id: row.template_id,
            template_text: row.template_text,
            questions: [],
          };
          session.logs.set(row.log_id, log);
        }

        // 3. Add the question to the correct log if it exists
        if (row.id) {
          log.questions.push({
            id: row.id,
            log_id: row.log_id,
            question: row.question,
            options: row.options,
            answer: row.answer,
            explanation: row.explanation,
            source_text: row.source_text,
            keywords: row.keywords,
            difficulty: row.difficulty,
            type: row.type,
            language: row.language,
            source: row.source,
            model: row.question_model || row.session_model,
            confidence: row.confidence,
            duration: row.duration, // student duration
          });
        }
      }
    });

    // 4. Convert the Maps to Arrays for the final JSON output
    const finalSessions = Array.from(sessionsMap.values()).map((session) => {
      return {
        ...session,
        logs: Array.from(session.logs.values()),
      };
    });

    res.json(finalSessions);
  } catch (err) {
    console.error("Error fetching full session details:", err);
    res.status(500).send("Server Error");
  }
});

route.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [sessionRows] = await query(
      "SELECT * FROM generation_sessions WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    if (sessionRows.length === 0) {
      return res.status(404).json({ error: "Session not found." });
    }
    const sessionData = sessionRows[0];

    const logsAndQuestionsSql = `
      SELECT
          gl.*,
          pt.template_text,
          gq.id as question_id,
          gq.log_id, gq.question, gq.options, gq.answer, gq.explanation,
          gq.source_text, gq.keywords, gq.difficulty, gq.confidence, gq.type,
          gq.model, gq.language, gq.source, gq.duration as student_duration
      FROM
          generation_logs gl
      LEFT JOIN
          prompt_templates pt ON gl.template_id = pt.id
      LEFT JOIN
          generated_questions gq ON gl.id = gq.log_id
      WHERE
          gl.session_id = ?
      ORDER BY
          gl.created_at ASC, gq.id ASC
    `;
    const [rows] = await query(logsAndQuestionsSql, [id]);

    if (rows.length === 0) {
      return res.json({ session: sessionData, logs: [] });
    }

    const logsMap = new Map();
    rows.forEach((row) => {
      if (!logsMap.has(row.id)) {
        logsMap.set(row.id, {
          id: row.id,
          session_id: row.session_id,
          template_id: row.template_id,
          duration: row.duration,
          pages: row.pages,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          total_tokens: row.total_tokens,
          question_count: row.question_count,
          created_at: row.created_at,
          template_text: row.template_text,
          questions: [],
        });
      }

      if (row.question_id) {
        logsMap.get(row.id).questions.push({
          id: row.question_id,
          log_id: row.log_id,
          question: row.question,
          options: row.options,
          answer: row.answer,
          explanation: row.explanation,
          source_text: row.source_text,
          keywords: row.keywords,
          difficulty: row.difficulty,
          confidence: row.confidence,
          type: row.type,
          model: row.model,
          language: row.language,
          source: row.source,
          duration: row.student_duration,
        });
      }
    });

    const fullLogs = Array.from(logsMap.values());
    sessionData.total_questions = fullLogs.reduce(
      (sum, log) => sum + log.questions.length,
      0
    );

    res.json({ session: sessionData, logs: fullLogs });
  } catch (err) {
    console.error("Error fetching session details:", err);
    res.status(500).send("Server Error");
  }
});

route.put("/:id/title", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user.id;
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "Title is required." });
    }
    const [result] = await query(
      "UPDATE generation_sessions SET title = ? WHERE id = ? AND user_id = ?",
      [title.trim(), id, userId]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Access denied." });
    res.json({ message: "Title updated." });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

route.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [sessionRows] = await query(
      "SELECT id FROM generation_sessions WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    if (sessionRows.length === 0)
      return res.status(404).json({ error: "Access denied." });

    await query(
      `
      DELETE gq 
      FROM generated_questions gq
      INNER JOIN generation_logs gl ON gq.log_id = gl.id
      WHERE gl.session_id = ?
    `,
      [id]
    );

    await query("DELETE FROM generation_logs WHERE session_id = ?", [id]);

    await query(
      "DELETE FROM generation_sessions WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    res.json({ message: "Deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

module.exports = route;
