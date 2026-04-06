// BLUN - AI Organisator | MIT License

const { Pool } = require("pg");

const pool = new Pool({
  host:     process.env.BLUN_DB_HOST     || "localhost",
  port:     parseInt(process.env.BLUN_DB_PORT || "5432", 10),
  database: process.env.BLUN_DB_NAME     || "blun",
  user:     process.env.BLUN_DB_USER     || "postgres",
  password: process.env.BLUN_DB_PASSWORD || "",
  max:      parseInt(process.env.BLUN_DB_POOL || "20", 10),
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

module.exports = { pool, query, queryOne };
