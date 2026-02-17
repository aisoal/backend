const express = require("express");
const route = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const { PDFDocument } = require("pdf-lib");
const { query } = require("../utils/dbConnect");
const authMiddleware = require("../middleware/auth.middleware");
const extractJSONArray = require("../utils/extractJSONArray");
const template = require("../utils/template");
const uploadMateri = require("../utils/uploadMateri");

const URL_AI = process.env.URL_AI || "http://localhost:8000";

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

function normalizePagesString(pagesStr) {
  if (!pagesStr || typeof pagesStr !== "string") {
    return "";
  }
  return pagesStr.replace(/\s/g, "").replace(/,{2,}/g, ",");
}

async function cropPdf(originalPdfBuffer, pagesStr, maxPages = 50) {
  if (!pagesStr || typeof pagesStr !== "string" || pagesStr.trim() === "") {
    const e = new Error("String halaman tidak boleh kosong.");
    e.status = 400;
    throw e;
  }

  const pageIndices = [];
  const parts = pagesStr.split(",").map((p) => p.trim());

  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part
        .split("-")
        .map((num) => parseInt(num.trim(), 10));
      if (isNaN(start) || isNaN(end) || start <= 0 || end < start) {
        const e = new Error(`Rentang halaman tidak valid: "${part}"`);
        e.status = 400;
        throw e;
      }
      for (let i = start; i <= end; i++) {
        pageIndices.push(i - 1);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (isNaN(pageNum) || pageNum <= 0) {
        const e = new Error(`Nomor halaman tidak valid: "${part}"`);
        e.status = 400;
        throw e;
      }
      pageIndices.push(pageNum - 1);
    }
  }

  const uniqueIndices = [...new Set(pageIndices)].sort((a, b) => a - b);

  if (uniqueIndices.length > maxPages) {
    const e = new Error(
      `Jumlah halaman tidak boleh lebih dari ${maxPages}. Anda memilih ${uniqueIndices.length} halaman.`,
    );
    e.status = 400;
    throw e;
  }

  const pdfDoc = await PDFDocument.load(originalPdfBuffer);
  const totalPages = pdfDoc.getPageCount();

  for (const index of uniqueIndices) {
    if (index >= totalPages) {
      const e = new Error(
        `Halaman ${index + 1} melebihi total halaman file (${totalPages}).`,
      );
      e.status = 400;
      throw e;
    }
  }

  const newPdfDoc = await PDFDocument.create();
  const copiedPages = await newPdfDoc.copyPages(pdfDoc, uniqueIndices);
  copiedPages.forEach((page) => newPdfDoc.addPage(page));

  const newPdfBytes = await newPdfDoc.save();
  return Buffer.from(newPdfBytes);
}

async function getAIResult(
  filename,
  file,
  type,
  difficulty,
  total,
  model,
  keywords,
  language,
  dataUrl,
) {
  const prompt = template(type, difficulty, total, keywords, language);
  const tempFileName = `py-temp-${Date.now()}-${filename}`;
  const tempFilePath = path.join(uploadDir, tempFileName);

  try {
    const base64Data = dataUrl.split(";base64,").pop();
    fs.writeFileSync(tempFilePath, base64Data, { encoding: "base64" });

    const startTime = Date.now();
    const response = await axios.post(`${URL_AI}/generate`, {
      query: prompt,
      model: model || "sonar",
      file_path: tempFilePath,
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    const resultText = response.data.answer;
    const usageEstimate = response.data.usage_estimate || {};

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    const questionArray = extractJSONArray(resultText, file, type, model);
    if (!questionArray || questionArray.length === 0) {
      throw new Error("Gagal parsing JSON dari respons AI.");
    }

    return { questionArray, duration, usedPrompt: prompt, usageEstimate };
  } catch (err) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (err.code === "ECONNREFUSED") {
      const e = new Error("AI Server (Python) tidak aktif.");
      e.status = 503;
      throw e;
    }
    throw err;
  }
}

async function processGeneration(
  req,
  res,
  userId,
  dataUrl,
  filename,
  file,
  type,
  difficulty,
  total,
  model,
  keywords,
  language,
  isNewSession,
  sessionId = null,
  pages = null,
) {
  let questionArray, duration, usedPrompt, usageEstimate;
  try {
    const resultFromAI = await getAIResult(
      filename,
      file,
      type,
      difficulty,
      total,
      model,
      keywords,
      language,
      dataUrl,
    );
    questionArray = resultFromAI.questionArray;
    duration = resultFromAI.duration;

    usedPrompt = resultFromAI.usedPrompt;
    usageEstimate = resultFromAI.usageEstimate;
  } catch (err) {
    return res
      .status(err.status || 500)
      .json({ error: { message: err.message } });
  }

  try {
    const [existingTemplate] = await query(
      "SELECT id FROM prompt_templates WHERE template_text = ? LIMIT 1",
      [usedPrompt],
    );
    let templateId;

    if (existingTemplate && existingTemplate.length > 0) {
      templateId = existingTemplate[0].id;
    } else {
      const result = await query(
        "INSERT INTO prompt_templates (template_text) VALUES (?)",
        [usedPrompt],
      );
      templateId = result.insertId || result[0].insertId;
    }

    let currentSessionId = sessionId;
    if (isNewSession) {
      currentSessionId = crypto.randomBytes(9).toString("base64url");
      await query(
        `INSERT INTO generation_sessions (id, user_id, title, filename, model, question_count) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          currentSessionId,
          userId,
          filename,
          filename,
          model,
          questionArray.length,
        ],
      );
    } else {
      await query(
        `UPDATE generation_sessions SET question_count = question_count + ? WHERE id = ?`,
        [questionArray.length, currentSessionId],
      );
    }

    const logResult = await query(
      `INSERT INTO generation_logs 
      (session_id, template_id, duration, pages, input_tokens, output_tokens, total_tokens, question_count) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,

      [
        currentSessionId,
        templateId,
        usageEstimate.duration || duration,
        pages,

        usageEstimate.input_tokens || 0,
        usageEstimate.output_tokens || 0,
        usageEstimate.total_tokens || 0,
        questionArray.length,
      ],
    );

    const logId = logResult.insertId || logResult[0].insertId;

    const questionValues = questionArray.map((q) => [
      logId,
      q.question,
      q.options ? JSON.stringify(q.options) : null,
      q.answer,
      q.explanation,
      q.source_text,
      q.keywords ? JSON.stringify(q.keywords) : null,
      q.difficulty,
      q.confidence,
      q.type,
      q.model || model,
      language,
      q.source,
      q.duration,
    ]);

    await query(
      `INSERT INTO generated_questions (log_id, question, options, answer, explanation, source_text, keywords, difficulty, confidence, type, model, language, source, duration) VALUES ?`,
      [questionValues],
    );

    await query(
      `UPDATE users SET generation_count = generation_count + 1 WHERE id = ?`,
      [userId],
    );
    const [updatedUser] = await query(
      "SELECT generation_count FROM users WHERE id = ?",
      [userId],
    );

    if (isNewSession) {
      return res.json({
        sessionId: currentSessionId,
        generation_count: updatedUser[0].generation_count,
      });
    } else {
      const [newRows] = await query(
        "SELECT * FROM generated_questions WHERE log_id = ? ORDER BY id ASC",
        [logId],
      );
      return res.json({
        newQuestions: newRows,
        generation_count: updatedUser[0].generation_count,
      });
    }
  } catch (dbError) {
    console.error("Database Error:", dbError);
    return res
      .status(500)
      .json({ error: { message: "Gagal menyimpan data ke database." } });
  }
}

route.post(
  "/",
  authMiddleware,
  uploadMateri.single("pdf"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const [rows] = await query(
        "SELECT generation_count, email FROM users WHERE id = ?",
        [userId],
      );
      if (!rows[0] || rows[0].generation_count >= 5) {
        return res.status(403).json({
          error: {
            message: "Batas maksimal 5 kali generate telah tercapai.",
          },
        });
      }

      const { file } = req;
      if (!file) return res.status(400).json({ error: "File not uploaded" });

      const { type, difficulty, total, model, keywords, language, pages } =
        req.body;

      const sanitizedFilename = path.basename(file.originalname);
      let fileBuffer = fs.readFileSync(file.path);
      const targetPath = path.join(uploadDir, sanitizedFilename);

      if (!fs.existsSync(targetPath)) {
        fs.renameSync(file.path, targetPath);
      } else if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      let finalPages = pages;
      if (!finalPages || finalPages.trim() === "") {
        finalPages = "1-10";
      }

      const normalizedPages = normalizePagesString(finalPages);

      fileBuffer = await cropPdf(fileBuffer, normalizedPages);

      const dataUrl = `data:application/pdf;base64,${fileBuffer.toString(
        "base64",
      )}`;
      return processGeneration(
        req,
        res,
        userId,
        dataUrl,
        sanitizedFilename,
        { ...file, size: fileBuffer.length },
        type,
        difficulty,
        total,
        model,
        keywords,
        language,
        true,
        null,
        normalizedPages,
      );
    } catch (err) {
      return res
        .status(err.status || 500)
        .json({ error: { message: err.message } });
    }
  },
);

route.post("/add-to-session/:sessionId", authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const [userRows] = await query(
      "SELECT generation_count, email FROM users WHERE id = ?",
      [userId],
    );
    if (
      !userRows[0] ||
      (userRows[0].generation_count >= 5 &&
        userRows[0].email !== "tesis@gmail.com")
    ) {
      return res.status(403).json({
        error: { message: "Batas maksimal 5 kali generate telah tercapai." },
      });
    }

    const [sessionRows] = await query(
      "SELECT filename, model FROM generation_sessions WHERE id = ? AND user_id = ?",
      [sessionId, userId],
    );
    if (sessionRows.length === 0)
      return res.status(404).json({ error: "Sesi tidak ditemukan." });

    const sanitizedFilename = path.basename(sessionRows[0].filename);
    const targetPath = path.join(uploadDir, sanitizedFilename);

    if (!fs.existsSync(targetPath))
      return res
        .status(500)
        .json({ error: { message: "File tidak ditemukan." } });

    let fileBuffer = fs.readFileSync(targetPath);
    const { type, difficulty, total, keywords, language, pages } = req.body;

    let finalPages = pages;
    if (!finalPages || finalPages.trim() === "") {
      finalPages = "1-10";
    }

    const normalizedPages = normalizePagesString(finalPages);

    fileBuffer = await cropPdf(fileBuffer, normalizedPages);

    const dataUrl = `data:application/pdf;base64,${fileBuffer.toString(
      "base64",
    )}`;
    return processGeneration(
      req,
      res,
      userId,
      dataUrl,
      sanitizedFilename,
      { originalname: sanitizedFilename, size: fileBuffer.length },
      type,
      difficulty,
      total,
      sessionRows[0].model,
      keywords,
      language,
      false,
      sessionId,
      normalizedPages,
    );
  } catch (err) {
    return res
      .status(err.status || 500)
      .json({ error: { message: err.message } });
  }
});

module.exports = route;
