/**
 * JSON 数据迁移脚本
 * 将 data/*.json 文件中的数据导入到 MySQL 数据库
 * 运行方式: node migrate-data.js
 */
const fs = require('fs');
const path = require('path');
const { getPool, query } = require('./utils/db');

const DATA_DIR = path.join(__dirname, 'data');

function readJson(filename) {
  try {
    const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8');
    return JSON.parse(content) || [];
  } catch (e) {
    console.warn(`[WARN] 无法读取 ${filename}: ${e.message}`);
    return [];
  }
}

async function migrateUsers() {
  const rows = readJson('users.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO users (id, username, password, nickname, avatar, openid, unionid, balance, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         username=VALUES(username), password=VALUES(password), nickname=VALUES(nickname),
         avatar=VALUES(avatar), openid=VALUES(openid), balance=VALUES(balance), role=VALUES(role)`,
      [
        row.id, row.username || null, row.password || null,
        row.nickname || null, row.avatar || null,
        row.openid || null, row.unionid || null,
        row.balance || 0, row.role || 'user',
        row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  await pool.execute(`ALTER TABLE users AUTO_INCREMENT = ${Math.max(...rows.map(r => r.id || 0)) + 1}`);
  console.log(`[OK] users: ${rows.length} 条`);
}

async function migrateDesigns() {
  const rows = readJson('designs.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO designs (id, user_id, design_code, title, pattern, image, bead_details, like_count, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title=VALUES(title), pattern=VALUES(pattern), image=VALUES(image),
         like_count=VALUES(like_count), is_public=VALUES(is_public)`,
      [
        row.id, row.user_id, row.design_code || null,
        row.name || row.title || null,
        typeof row.pattern === 'string' ? row.pattern : JSON.stringify(row.pattern || []),
        row.cover_image || row.image || null,
        typeof row.bead_details === 'string' ? row.bead_details : JSON.stringify(row.bead_details || []),
        row.like_count || 0,
        row.is_public ? 1 : 0,
        row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        row.updated_at || row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  await pool.execute(`ALTER TABLE designs AUTO_INCREMENT = ${Math.max(...rows.map(r => r.id || 0)) + 1}`);
  console.log(`[OK] designs: ${rows.length} 条`);
}

async function migrateOrders() {
  const rows = readJson('orders.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO orders (id, user_id, design_id, design_name, pattern, bead_details, quantity, total_price, status, address_id, pay_method, paid_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status=VALUES(status), total_price=VALUES(total_price), updated_at=VALUES(updated_at)`,
      [
        row.id, row.user_id, row.design_id || null,
        row.design_name || null,
        typeof row.pattern === 'string' ? row.pattern : JSON.stringify(row.pattern || []),
        typeof row.bead_details === 'string' ? row.bead_details : JSON.stringify(row.bead_details || []),
        row.quantity || 1,
        row.total_price || 0,
        row.status || 'pending',
        row.address_id || null,
        row.pay_method || null,
        row.paid_at || null,
        row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        row.updated_at || row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  await pool.execute(`ALTER TABLE orders AUTO_INCREMENT = ${Math.max(...rows.map(r => r.id || 0)) + 1}`);
  console.log(`[OK] orders: ${rows.length} 条`);
}

async function migrateLikes() {
  const rows = readJson('likes.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO likes (id, user_id, design_id, created_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)`,
      [row.id, row.user_id, row.design_id, row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')]
    );
  }
  if (rows.length > 0) {
    await pool.execute(`ALTER TABLE likes AUTO_INCREMENT = ${Math.max(...rows.map(r => r.id || 0)) + 1}`);
  }
  console.log(`[OK] likes: ${rows.length} 条`);
}

async function migrateBeads() {
  const rows = readJson('beads.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO beads (id, name, category, color_family, size, price, image, color, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), category=VALUES(category), price=VALUES(price), image=VALUES(image)`,
      [
        row.id, row.name || null, row.category || null, row.color_family || null,
        row.size || null, row.price || 0, row.image || null,
        row.color || '#9E9E9E', row.type || 'dynamic',
        row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        row.updated_at || row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  await pool.execute(`ALTER TABLE beads AUTO_INCREMENT = ${Math.max(...rows.map(r => r.id || 0)) + 1}`);
  console.log(`[OK] beads: ${rows.length} 条`);
}

async function migrateCarts() {
  const rows = readJson('carts.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO carts (id, user_id, items, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE items=VALUES(items), updated_at=VALUES(updated_at)`,
      [
        row.id || null, row.user_id,
        typeof row.items === 'string' ? row.items : JSON.stringify(row.items || []),
        row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        row.updated_at || row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  if (rows.length > 0) {
    await pool.execute(`ALTER TABLE carts AUTO_INCREMENT = ${Math.max(...rows.map(r => r.id || 0)) + 1}`);
  }
  console.log(`[OK] carts: ${rows.length} 条`);
}

async function migrateAddresses() {
  const rows = readJson('addresses.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO addresses (id, user_id, name, phone, province, city, district, address, detail, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), phone=VALUES(phone), address=VALUES(address), is_default=VALUES(is_default)`,
      [
        row.id, row.user_id, row.name || null, row.phone || null,
        row.province || null, row.city || null, row.district || null,
        row.address || null, row.detail || null,
        row.is_default ? 1 : 0,
        row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        row.updated_at || row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  console.log(`[OK] addresses: ${rows.length} 条`);
}

async function migratePayments() {
  const rows = readJson('payments.json');
  if (rows.length === 0) return;
  const pool = getPool();
  for (const row of rows) {
    // 状态映射：paid -> success
    let status = row.status || 'pending';
    if (status === 'paid' || status === 'success') status = 'success';
    else if (status !== 'pending' && status !== 'failed') status = 'pending';

    await pool.execute(
      `INSERT INTO payments (id, user_id, order_id, pay_no, amount, pay_method, status, prepay_id, wx_transaction_id, paid_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status=VALUES(status), amount=VALUES(amount), paid_at=VALUES(paid_at)`,
      [
        row.id, row.user_id, row.order_id || null,
        row.trade_no || row.pay_no || row.order_no || null,
        row.amount || 0,
        row.pay_type || row.pay_method || 'wxpay',
        status,
        row.prepay_id || null,
        row.wx_transaction_id || null,
        row.paid_at || null,
        row.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  if (rows.length > 0) {
    await pool.execute(`ALTER TABLE payments AUTO_INCREMENT = ${Math.max(...rows.map(r => r.id || 0)) + 1}`);
  }
  console.log(`[OK] payments: ${rows.length} 条`);
}

async function main() {
  console.log('[MySQL] 开始数据迁移...');
  try {
    await migrateUsers();
    await migrateDesigns();
    await migrateOrders();
    await migrateLikes();
    await migrateBeads();
    await migrateCarts();
    await migrateAddresses();
    await migratePayments();
    console.log('[MySQL] 数据迁移完成！');
    process.exit(0);
  } catch (err) {
    console.error('[MySQL] 迁移失败:', err.message);
    process.exit(1);
  }
}

main();
