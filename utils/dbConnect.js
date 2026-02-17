const mysql = require("mysql");
const util = require("util");
require("dotenv").config();

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  acquireTimeout: 20000,
});

console.log("MySQL (mysql) Pool created.");

pool.query = util.promisify(pool.query);

const query = async (sql, params) => {
  try {
    const rows = await pool.query(sql, params);
    return [rows, undefined];
  } catch (err) {
    console.error("DB Query Error:", err.code, err.message);
    throw err;
  }
};

module.exports = { query };
