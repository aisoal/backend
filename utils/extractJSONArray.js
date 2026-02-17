// Mengimpor fungsi jsonrepair dari package "jsonrepair"
const { jsonrepair } = require("jsonrepair");

// Mendefinisikan fungsi extractJSONArray dengan parameter:
// text  : string teks (biasanya dari LLM) yang berisi JSON array
// file  : objek file (misalnya dari multer) untuk ambil nama file sumber
// type  : tipe data/soal yang ingin ditandai di output
// model : nama model yang menghasilkan JSON (opsional)
const extractJSONArray = (text, file, type, model) => {

  // Log ke console untuk debugging, menampilkan teks mentah yang akan diproses
  console.log("Extracting JSON array from text:", text);

  // Jika text kosong/undefined/null, langsung kembalikan array kosong
  if (!text) return [];

  // Menghapus pola seperti [1], [23] dari teks (biasanya format citation LLM)
  // Regex /\[\d+\]/g akan mencari bracket yang berisi angka, misalnya [10]
  let cleanText = text.replace(/\[\d+\]/g, "");

  // Mencari potongan yang berbentuk JSON array of object:
  // [...{...}...] dengan regex:
  // \[           : karakter '['
  // \s*          : spasi opsional
  // {[\s\S]*?}   : sebuah objek {...} (non-greedy, bisa ada newline)
  // \s*          : spasi opsional
  // \]           : karakter ']'
  const match = cleanText.match(/\[\s*{[\s\S]*?}\s*\]/);

  // Jika tidak ditemukan pola JSON array, log error dan kembalikan array kosong
  if (!match) {
    console.error("No JSON array found in the response (after cleaning)");
    return [];
  }

  // Mengambil nama file asli jika ada, jika tidak ada gunakan "unknown.pdf"
  const filename = file.originalname || "unknown.pdf";

  try {
    // Memperbaiki JSON yang mungkin rusak menggunakan jsonrepair
    // match[0] adalah string array yang cocok dengan regex
    const repaired = jsonrepair(match[0]);

    // Parse string JSON hasil repair menjadi array JavaScript
    const jsonArray = JSON.parse(repaired);

    // Mapping tiap item dalam array, menambahkan metadata:
    // type, model, source, dan id unik
    return jsonArray.map((item) => ({
      // spread properties asli dari item
      ...item,
      // menambahkan type dari parameter fungsi
      type: type,
      // jika model tidak diisi, default ke "sonar"
      model: model || "sonar",
      // menyimpan nama file sumber
      source: filename,
      // membuat id unik berbasis timestamp + random string
      id: new Date().getTime() + Math.random().toString(36).substring(2, 15),
    }));
  } catch (error) {
    // Jika terjadi error saat perbaikan atau parsing JSON,
    // log pesan error ke console
    console.error("Error parsing JSON:", error.message);

    // Kembalikan array kosong jika parsing gagal
    return [];
  }
};

// Mengekspor fungsi extractJSONArray agar bisa digunakan di file lain
module.exports = extractJSONArray;
