const createKeywordInstructions = (keywords) => {
  if (!keywords || keywords.trim() === "") {
    return {
      topic: "",
      rule: `- For the 'keywords' array, add 2-4 relevant keywords based on the content.`,
    };
  }
  const kList = keywords
    .split(",")
    .map((k) => `"${k.trim()}"`)
    .filter((k) => k !== `""`)
    .join(", ");
  return {
    topic: `\nCRITICAL: All questions must relate to one of these keywords: [${kList}].`,
    rule: `- For the 'keywords' array, you MUST include at least one user keyword from [${kList}] and 1-3 other relevant keywords.`,
  };
};

const getBloomInstruction = (diff) => {
  if (diff === "mixed") {
    return `
COGNITIVE LEVEL: MIXED (STRATIFIED).
INSTRUCTION: You must generate questions with varying difficulties as specified in the Rules section.
CRITICAL: Pay close attention to the requested distribution (LOTS/MOTS/HOTS).
`;
  }

  const level = diff.toUpperCase();
  const rules = {
    LOTS: {
      desc: "(C1-C2 Remembering/Understanding)",
      rule: "Focus on factual recall. Use keywords like: Sebutkan, Apa, Siapa, Kapan, Dimana, Jelaskan definisi.",
    },
    MOTS: {
      desc: "(C3-C4 Applying/Analyzing)",
      rule: "Focus on connecting concepts and explaining reasons. Use keywords like: Mengapa, Bagaimana, Jelaskan hubungan, Klasifikasikan, Uraikan.",
    },
    HOTS: {
      desc: "(C5-C6 Evaluating/Creating)",
      rule: "Focus on judgment, prediction, and inference not explicitly stated. Use keywords like: Analisislah, Bandingkan, Kritiklah, Apa dampak jangka panjang, Buatlah hipotesis, Simpulkan.",
    },
  };

  const selected = rules[level] || rules.LOTS;

  return `
COGNITIVE LEVEL: ${level} ${selected.desc}
INSTRUCTION: ${selected.rule}
CRITICAL: Do NOT just ask questions that can be answered by simply finding a sentence in the text. The answer requires ${
    level === "HOTS" ? "reasoning and logic" : "understanding context"
  }.
`;
};

const ANCHOR_DEF =
  "- source_text (string, a unique, meaningful phrase (5-8 words) quoted exactly from the start of the source sentence. It must NOT end with conjunctions like 'dan', 'yang', 'atau'. Used for hyperlink text fragments)";

const COMMON_FIELDS = `
- question (string)
- answer (string)
- explanation (string)
${ANCHOR_DEF}
- keywords (array of strings)
- difficulty (must be "{difficulty}")
- duration (string, estimated time)
- confidence (string, e.g., "95%")`;

const COMMON_RULES = `
- The 'question' field MUST be direct. Do NOT use prefixes like "According to the text", "Based on the document".
- Do NOT include citations like [1], [2].
- Do NOT add text before/after JSON. Output JSON only.`;

const TYPE_CONFIG = {
  "multiple-choice": {
    extraFields: `- options (array of 4 strings, RAW text only, NO prefixes like "A." or "1.")\n- answer (MUST be exactly one of the string values in options)`,
    extraRules: `- CRITICAL: The 'options' array must contain ONLY the answer text. Do NOT include prefixes like "A.", "B.", "a.", "b.", "1.", "2." inside the strings.\n- Distribute correct answers evenly across positions 0-3.\n- Do NOT bias towards the first option.\n- Incorrect options must be plausible.`,
    example: (diff) => ({
      no: 1,
      question: "Siapa penemu mesin uap?",
      options: [
        "Thomas Alva Edison",
        "James Watt",
        "Alexander Graham Bell",
        "Nikola Tesla",
      ],
      answer: "James Watt",
      explanation: "James Watt menyempurnakan...",
      source_text: "Mesin uap yang efisien dikembangkan oleh James Watt",
      keywords: ["mesin uap"],
      difficulty: diff,
      duration: "45 detik",
      confidence: "95%",
    }),
  },
  essay: {
    extraFields: `- answer (the comprehensive ideal answer)`,
    extraRules: ``,
    example: (diff) => ({
      no: 1,
      question: "Jelaskan dampak revolusi industri.",
      answer: "Revolusi industri menyebabkan...",
      explanation: "Dampak utamanya adalah...",
      source_text: "Revolusi industri mengubah tatanan ekonomi global",
      keywords: ["revolusi industri"],
      difficulty: diff,
      duration: "3 menit",
      confidence: "90%",
    }),
  },
  "true-false": {
    extraFields: `- options (["Benar", "Salah"])\n- answer (MUST be "Benar" or "Salah")`,
    extraRules: `- CRITICAL: Generate ~50% True and ~50% False. Do NOT make all answers "Benar".\n- "Salah" answers must be plausible but factually incorrect based on text.`,
    example: (diff) => ({
      no: 1,
      question: "Matahari terbit dari barat.",
      options: ["Benar", "Salah"],
      answer: "Salah",
      explanation: "Karena rotasi bumi...",
      source_text: "Rotasi bumi menyebabkan matahari tampak terbit",
      keywords: ["matahari"],
      difficulty: diff,
      duration: "20 detik",
      confidence: "99%",
    }),
  },
  "fill-in-the-blank": {
    extraFields: `- question (sentence with blank "____")\n- answer (specific word/phrase filling the blank)`,
    extraRules: ``,
    example: (diff) => ({
      no: 1,
      question: "Ibukota ____ adalah Jakarta.",
      answer: "Jakarta",
      explanation: "Pusat pemerintahan...",
      source_text: "Pusat pemerintahan Indonesia terletak di Jakarta",
      keywords: ["ibukota"],
      difficulty: diff,
      duration: "15 detik",
      confidence: "99%",
    }),
  },
};

const template = (
  type = "multiple-choice",
  difficulty = "mots",
  total = 5,
  keywords = "",
  language = "Indonesia"
) => {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG["multiple-choice"];
  const kwData = createKeywordInstructions(keywords);

  let distributionRule = "";
  if (difficulty === "mixed") {
    distributionRule = `
- CRITICAL: You must generate exactly ${total} questions with this SPECIFIC distribution:
  1. Approx 40% LOTS (Questions 1-${Math.ceil(
    total * 0.4
  )}). Focus on facts/definitions.
  2. Approx 30% MOTS (Questions ${Math.ceil(total * 0.4) + 1}-${Math.ceil(
      total * 0.7
    )}). Focus on context/analysis.
  3. Approx 30% HOTS (Questions ${
    Math.ceil(total * 0.7) + 1
  }-${total}). Focus on evaluation/creation.
- You MUST explicitly set the "difficulty" field in JSON to "LOTS", "MOTS", or "HOTS" corresponding to the question level.
`;
  }

  return `Generate exactly ${total} ${type.replace(
    /-/g,
    " "
  )} questions from the document content.
${getBloomInstruction(difficulty)}
${kwData.topic}

For each question, provide:
${COMMON_FIELDS.replace(
  "{difficulty}",
  difficulty === "mixed" ? "LOTS, MOTS, or HOTS" : difficulty
)}
${config.extraFields}

The result must be a single, valid JSON array of objects.

Example:
${JSON.stringify(
  config.example(difficulty === "mixed" ? "mots" : difficulty),
  null,
  2
)}

Rules:
${distributionRule}
${kwData.rule}
${COMMON_RULES}
${config.extraRules}
- All text content must be in ${language}.`;
};

module.exports = template;
