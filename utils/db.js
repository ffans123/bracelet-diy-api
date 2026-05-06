/**
 * MySQL 数据库连接模块
 * 从环境变量读取云托管 MySQL 配置
 */
const mysql = require('mysql2/promise');

const MYSQL_ADDRESS = process.env.MYSQL_ADDRESS || '';
const MYSQL_USERNAME = process.env.MYSQL_USERNAME || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';

let pool = null;

function parseAddress(addr) {
  const parts = addr.split(':');
  return {
    host: parts[0] || 'localhost',
    port: parseInt(parts[1] || '3306', 10),
  };
}

function getPool() {
  if (!pool) {
    const { host, port } = parseAddress(MYSQL_ADDRESS);
    pool = mysql.createPool({
      host,
      port,
      user: MYSQL_USERNAME,
      password: MYSQL_PASSWORD,
      database: 'bracelet_diy', // 默认数据库名
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

async function query(sql, params) {
  const conn = getPool();
  const [rows] = await conn.execute(sql, params);
  return rows;
}

async function transaction(fn) {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function initDatabase() {
  const { host, port } = parseAddress(MYSQL_ADDRESS);
  const conn = await mysql.createConnection({
    host,
    port,
    user: MYSQL_USERNAME,
    password: MYSQL_PASSWORD,
  });
  await conn.execute(`CREATE DATABASE IF NOT EXISTS bracelet_diy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  console.log('[MySQL] 数据库 bracelet_diy 已就绪');
}

module.exports = {
  getPool,
  query,
  transaction,
  initDatabase,
};
