/**
 * MySQL 数据库初始化脚本
 * 自动创建数据库和表结构
 */
const { getPool, initDatabase } = require('./db');

const TABLES = [
  // 用户表
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    nickname VARCHAR(100),
    avatar VARCHAR(500),
    openid VARCHAR(100) UNIQUE,
    unionid VARCHAR(100),
    balance DECIMAL(10,2) DEFAULT 0,
    role ENUM('user','admin') DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_openid (openid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 设计表
  `CREATE TABLE IF NOT EXISTS designs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    design_code VARCHAR(50) UNIQUE,
    title VARCHAR(200),
    pattern TEXT,
    image VARCHAR(500),
    bead_details TEXT,
    mode VARCHAR(50),
    price DECIMAL(10,2) DEFAULT 0,
    perimeter DECIMAL(10,2) DEFAULT 0,
    bg_index INT DEFAULT 0,
    like_count INT DEFAULT 0,
    is_public TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_design_code (design_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 订单表
  `CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    design_id INT,
    design_name VARCHAR(200),
    pattern TEXT,
    bead_details TEXT,
    quantity INT DEFAULT 1,
    total_price DECIMAL(10,2) DEFAULT 0,
    status ENUM('pending','paid','shipped','completed','cancelled') DEFAULT 'pending',
    address_id VARCHAR(50),
    pay_method VARCHAR(20),
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 点赞表
  `CREATE TABLE IF NOT EXISTS likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    design_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_design (user_id, design_id),
    INDEX idx_design_id (design_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 珠子表
  `CREATE TABLE IF NOT EXISTS beads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    category VARCHAR(50),
    color_family VARCHAR(50),
    size VARCHAR(20),
    price DECIMAL(10,2) DEFAULT 0,
    image VARCHAR(500),
    color VARCHAR(20) DEFAULT '#9E9E9E',
    type VARCHAR(20) DEFAULT 'dynamic',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 购物车表（每个用户一条记录，items 存 JSON）
  `CREATE TABLE IF NOT EXISTS carts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    items TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 地址表
  `CREATE TABLE IF NOT EXISTS addresses (
    id VARCHAR(50) PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(50),
    phone VARCHAR(20),
    province VARCHAR(50),
    city VARCHAR(50),
    district VARCHAR(50),
    address VARCHAR(200),
    detail VARCHAR(200),
    is_default TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 支付记录表
  `CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_id INT,
    pay_no VARCHAR(50) UNIQUE,
    amount DECIMAL(10,2) DEFAULT 0,
    pay_method VARCHAR(20),
    status ENUM('pending','success','failed') DEFAULT 'pending',
    prepay_id VARCHAR(100),
    wx_transaction_id VARCHAR(100),
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_id (order_id),
    INDEX idx_pay_no (pay_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function initTables() {
  const pool = getPool();
  for (const sql of TABLES) {
    await pool.execute(sql);
  }
  console.log('[MySQL] 所有表已就绪');
}

async function setup() {
  try {
    await initDatabase();
    await initTables();
    // 兼容：为旧表添加缺失字段
    const pool = getPool();
    try {
      await pool.execute(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS mode VARCHAR(50)`);
      await pool.execute(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT 0`);
      await pool.execute(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS perimeter DECIMAL(10,2) DEFAULT 0`);
      await pool.execute(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS bg_index INT DEFAULT 0`);
      console.log('[MySQL] 字段兼容性检查完成');
    } catch (alterErr) {
      // IF NOT EXISTS 可能在某些 MySQL 版本不支持，忽略重复添加错误
      if (!alterErr.message.includes('Duplicate')) {
        console.log('[MySQL] 字段兼容:', alterErr.message);
      }
    }
    console.log('[MySQL] 数据库初始化完成');
  } catch (err) {
    console.error('[MySQL] 初始化失败:', err.message);
    throw err;
  }
}

module.exports = { setup };
