/**
 * MySQL 数据库操作类（替代 JSON 文件存储）
 * 保持与原有 jsonDB.js 完全相同的导出接口
 */
const { query, transaction } = require('./db');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 保留文件常量兼容（不再实际读写）
const FILES = {
  USERS: path.join(DATA_DIR, 'users.json'),
  DESIGNS: path.join(DATA_DIR, 'designs.json'),
  ORDERS: path.join(DATA_DIR, 'orders.json'),
  CARTS: path.join(DATA_DIR, 'carts.json'),
  BEADS: path.join(DATA_DIR, 'beads.json'),
  LIKES: path.join(DATA_DIR, 'likes.json'),
  PAYMENTS: path.join(DATA_DIR, 'payments.json'),
  ADDRESSES: path.join(DATA_DIR, 'addresses.json'),
};

function read(file) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    return JSON.parse(content) || [];
  } catch {
    return [];
  }
}

function write(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// JSON 字段解析辅助函数
function parseJsonField(row, fields) {
  if (!row) return row;
  fields.forEach(f => {
    if (row[f] && typeof row[f] === 'string') {
      try { row[f] = JSON.parse(row[f]); } catch {}
    }
  });
  return row;
}

function stringifyJsonField(data, fields) {
  const result = { ...data };
  fields.forEach(f => {
    if (result[f] !== undefined && typeof result[f] !== 'string') {
      result[f] = JSON.stringify(result[f]);
    }
  });
  return result;
}

// ========== 用户相关 ==========
const USER_JSON_FIELDS = [];

async function getUsers() {
  return await query('SELECT * FROM users ORDER BY id DESC');
}

async function saveUsers(users) {
  // MySQL 模式下不再需要批量保存
  return true;
}

async function findUserByUsername(username) {
  const rows = await query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  const user = rows[0] || null;
  if (user) {
    if (user.balance === null) user.balance = 0;
    if (!user.role) user.role = 'user';
  }
  return user;
}

async function findUserById(id) {
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  const user = rows[0] || null;
  if (user) {
    if (user.balance === null) user.balance = 0;
    if (!user.role) user.role = 'user';
  }
  return user;
}

async function findUserByOpenid(openid) {
  const rows = await query('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
  return rows[0] || null;
}

async function addUser(user) {
  const data = stringifyJsonField(user, USER_JSON_FIELDS);
  const fields = Object.keys(data).filter(k => !['id', 'created_at', 'updated_at'].includes(k));
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => data[f]);
  const sql = `INSERT INTO users (${fields.join(',')}) VALUES (${placeholders})`;
  const result = await query(sql, values);
  return result.insertId;
}

async function updateUser(id, data) {
  const clean = { ...data };
  delete clean.id;
  delete clean.created_at;
  delete clean.updated_at;
  const fields = Object.keys(clean);
  if (fields.length === 0) return true;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => clean[f]);
  values.push(id);
  await query(`UPDATE users SET ${setClause} WHERE id = ?`, values);
  return true;
}

async function deleteUser(id) {
  await query('DELETE FROM users WHERE id = ?', [id]);
  return true;
}

// ========== 设计相关 ==========
const DESIGN_JSON_FIELDS = ['pattern', 'bead_details'];

async function getDesigns() {
  const rows = await query('SELECT * FROM designs ORDER BY id DESC');
  return rows.map(r => parseJsonField(r, DESIGN_JSON_FIELDS));
}

async function saveDesigns(designs) {
  return true;
}

async function findDesignByCode(code) {
  const rows = await query('SELECT * FROM designs WHERE design_code = ? LIMIT 1', [code]);
  return parseJsonField(rows[0] || null, DESIGN_JSON_FIELDS);
}

async function findDesignById(id) {
  const rows = await query('SELECT * FROM designs WHERE id = ? LIMIT 1', [id]);
  return parseJsonField(rows[0] || null, DESIGN_JSON_FIELDS);
}

// designs 表的有效字段映射
const DESIGN_FIELD_MAP = {
  name: 'title',
  bgIndex: 'bg_index',
  user_id: 'user_id',
  design_code: 'design_code',
  title: 'title',
  pattern: 'pattern',
  image: 'image',
  bead_details: 'bead_details',
  mode: 'mode',
  price: 'price',
  perimeter: 'perimeter',
  bg_index: 'bg_index',
  like_count: 'like_count',
  is_public: 'is_public'
};

async function addDesign(design) {
  const data = stringifyJsonField(design, DESIGN_JSON_FIELDS);
  // 字段映射
  const mapped = {};
  for (const [key, val] of Object.entries(data)) {
    const dbField = DESIGN_FIELD_MAP[key];
    if (dbField && !['id', 'created_at', 'updated_at'].includes(dbField)) {
      mapped[dbField] = val;
    }
  }
  const fields = Object.keys(mapped);
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => mapped[f]);
  const sql = `INSERT INTO designs (${fields.join(',')}) VALUES (${placeholders})`;
  const result = await query(sql, values);
  return result.insertId;
}

async function updateDesign(id, data) {
  const raw = stringifyJsonField(data, DESIGN_JSON_FIELDS);
  // 字段映射
  const clean = {};
  for (const [key, val] of Object.entries(raw)) {
    const dbField = DESIGN_FIELD_MAP[key];
    if (dbField && !['id', 'created_at', 'updated_at'].includes(dbField)) {
      clean[dbField] = val;
    }
  }
  const fields = Object.keys(clean);
  if (fields.length === 0) return true;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => clean[f]);
  values.push(id);
  await query(`UPDATE designs SET ${setClause} WHERE id = ?`, values);
  return true;
}

async function deleteDesign(id) {
  await query('DELETE FROM designs WHERE id = ?', [id]);
  return true;
}

// ========== 订单相关 ==========
const ORDER_JSON_FIELDS = ['pattern', 'bead_details'];

async function getOrders() {
  const rows = await query('SELECT * FROM orders ORDER BY id DESC');
  return rows.map(r => parseJsonField(r, ORDER_JSON_FIELDS));
}

async function saveOrders(orders) {
  return true;
}

const ORDER_FIELD_MAP = {
  designId: 'design_id',
  totalPrice: 'total_price',
  orderNo: 'order_no',
  user_id: 'user_id',
  order_no: 'order_no',
  design_id: 'design_id',
  design_name: 'design_name',
  pattern: 'pattern',
  bead_details: 'bead_details',
  quantity: 'quantity',
  total_price: 'total_price',
  consignee: 'consignee',
  phone: 'phone',
  address: 'address',
  remark: 'remark',
  production_method: 'production_method',
  packaging_method: 'packaging_method',
  express_method: 'express_method',
  extra_fee: 'extra_fee',
  status: 'status',
  address_id: 'address_id',
  pay_method: 'pay_method',
  paid_at: 'paid_at',
  express_company: 'express_company',
  express_no: 'express_no',
  ship_time: 'ship_time'
};

async function addOrder(order) {
  const data = stringifyJsonField(order, ORDER_JSON_FIELDS);
  const mapped = {};
  for (const [key, val] of Object.entries(data)) {
    const dbField = ORDER_FIELD_MAP[key];
    if (dbField && !['id', 'created_at', 'updated_at'].includes(dbField)) {
      mapped[dbField] = val;
    }
  }
  const fields = Object.keys(mapped);
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => mapped[f]);
  const sql = `INSERT INTO orders (${fields.join(',')}) VALUES (${placeholders})`;
  const result = await query(sql, values);
  return result.insertId;
}

async function updateOrder(id, data) {
  const raw = stringifyJsonField(data, ORDER_JSON_FIELDS);
  const clean = {};
  for (const [key, val] of Object.entries(raw)) {
    const dbField = ORDER_FIELD_MAP[key];
    if (dbField && !['id', 'created_at', 'updated_at'].includes(dbField)) {
      clean[dbField] = val;
    }
  }
  const fields = Object.keys(clean);
  if (fields.length === 0) return true;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => clean[f]);
  values.push(id);
  await query(`UPDATE orders SET ${setClause} WHERE id = ?`, values);
  return true;
}

async function deleteOrder(id) {
  await query('DELETE FROM orders WHERE id = ?', [id]);
  return true;
}

async function findOrderById(id) {
  const rows = await query('SELECT * FROM orders WHERE id = ? LIMIT 1', [id]);
  return parseJsonField(rows[0] || null, ORDER_JSON_FIELDS);
}

// ========== 点赞相关 ==========
async function getLikes() {
  return await query('SELECT * FROM likes ORDER BY id DESC');
}

async function saveLikes(likes) {
  return true;
}

async function isLiked(userId, designId) {
  const rows = await query('SELECT * FROM likes WHERE user_id = ? AND design_id = ? LIMIT 1', [userId, designId]);
  return rows[0] || null;
}

async function toggleLike(userId, designId) {
  return await transaction(async (conn) => {
    const [existing] = await conn.execute(
      'SELECT * FROM likes WHERE user_id = ? AND design_id = ? LIMIT 1',
      [userId, designId]
    );
    if (existing.length > 0) {
      // 取消点赞
      await conn.execute('DELETE FROM likes WHERE user_id = ? AND design_id = ?', [userId, designId]);
      const [designs] = await conn.execute('SELECT like_count FROM designs WHERE id = ? LIMIT 1', [designId]);
      if (designs.length > 0) {
        const newCount = Math.max(0, (designs[0].like_count || 0) - 1);
        await conn.execute('UPDATE designs SET like_count = ? WHERE id = ?', [newCount, designId]);
      }
      return false;
    } else {
      // 添加点赞
      await conn.execute(
        'INSERT INTO likes (user_id, design_id) VALUES (?, ?)',
        [userId, designId]
      );
      const [designs] = await conn.execute('SELECT like_count FROM designs WHERE id = ? LIMIT 1', [designId]);
      if (designs.length > 0) {
        const newCount = (designs[0].like_count || 0) + 1;
        await conn.execute('UPDATE designs SET like_count = ? WHERE id = ?', [newCount, designId]);
      }
      return true;
    }
  });
}

// ========== 珠子相关 ==========
async function getBeads() {
  return await query('SELECT * FROM beads ORDER BY id ASC');
}

async function saveBeads(beads) {
  return true;
}

async function findBeadById(id) {
  const rows = await query('SELECT * FROM beads WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function addBead(bead) {
  const fields = Object.keys(bead).filter(k => !['id', 'created_at', 'updated_at'].includes(k));
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => bead[f]);
  const sql = `INSERT INTO beads (${fields.join(',')}) VALUES (${placeholders})`;
  const result = await query(sql, values);
  return result.insertId;
}

async function updateBead(id, data) {
  const clean = { ...data };
  delete clean.id;
  delete clean.created_at;
  delete clean.updated_at;
  const fields = Object.keys(clean);
  if (fields.length === 0) return true;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => clean[f]);
  values.push(id);
  await query(`UPDATE beads SET ${setClause} WHERE id = ?`, values);
  return true;
}

async function deleteBead(id) {
  await query('DELETE FROM beads WHERE id = ?', [id]);
  return true;
}

// ========== 购物车相关 ==========
const CART_JSON_FIELDS = ['items'];

async function getCarts() {
  const rows = await query('SELECT * FROM carts ORDER BY id DESC');
  return rows.map(r => parseJsonField(r, CART_JSON_FIELDS));
}

async function saveCarts(carts) {
  return true;
}

async function getCartByUserId(userId) {
  const rows = await query('SELECT * FROM carts WHERE user_id = ? LIMIT 1', [userId]);
  return parseJsonField(rows[0] || null, CART_JSON_FIELDS);
}

async function updateCart(cart) {
  const data = stringifyJsonField(cart, CART_JSON_FIELDS);
  const existing = await getCartByUserId(cart.user_id);
  if (existing) {
    const fields = Object.keys(data).filter(k => !['id', 'user_id', 'created_at'].includes(k));
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f]);
    values.push(cart.user_id);
    await query(`UPDATE carts SET ${setClause} WHERE user_id = ?`, values);
  } else {
    const fields = Object.keys(data).filter(k => !['id', 'created_at', 'updated_at'].includes(k));
    const placeholders = fields.map(() => '?').join(',');
    const values = fields.map(f => data[f]);
    await query(`INSERT INTO carts (${fields.join(',')}) VALUES (${placeholders})`, values);
  }
  return true;
}

// ========== 地址相关 ==========
async function getAddresses() {
  return await query('SELECT * FROM addresses ORDER BY created_at DESC');
}

async function saveAddresses(addresses) {
  return true;
}

async function getAddressesByUserId(userId) {
  return await query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [userId]);
}

async function addAddress(address) {
  const data = { ...address };
  if (!data.id) {
    data.id = 'addr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
  const fields = Object.keys(data).filter(k => !['created_at', 'updated_at'].includes(k));
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => data[f]);
  await query(`INSERT INTO addresses (${fields.join(',')}) VALUES (${placeholders})`, values);
  return data.id;
}

async function updateAddress(id, data) {
  const clean = { ...data };
  delete clean.id;
  delete clean.created_at;
  delete clean.updated_at;
  const fields = Object.keys(clean);
  if (fields.length === 0) return true;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => clean[f]);
  values.push(id);
  await query(`UPDATE addresses SET ${setClause} WHERE id = ?`, values);
  return true;
}

async function deleteAddress(id) {
  await query('DELETE FROM addresses WHERE id = ?', [id]);
  return true;
}

async function setDefaultAddress(userId, addressId) {
  await query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
  await query('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [addressId, userId]);
  return true;
}

// ========== 解析 pattern 为珠子详情 ==========
async function parsePatternToBeadDetails(pattern) {
  const beads = await getBeads();
  const details = [];
  if (!Array.isArray(pattern)) return details;

  for (const item of pattern) {
    let beadId = null;
    let type = 'unknown';
    const code = String(item);

    if (typeof item === 'object' && item !== null && item.mat !== undefined) {
      beadId = parseInt(item.id || item.mat);
      type = 'sandbox';
    } else if (typeof item === 'string') {
      const dynamicMatch = item.match(/^dynamic_(\d+)$/);
      const presetMatch = item.match(/^[a-z]+_(\d+)$/);
      const simpleCodeMatch = item.match(/^[a-z]+\d+$/i);
      if (dynamicMatch) {
        beadId = parseInt(dynamicMatch[1]);
        type = 'dynamic';
      } else if (presetMatch) {
        beadId = parseInt(presetMatch[1]);
        type = 'preset';
      } else if (simpleCodeMatch) {
        // 简单编码如 w1, b2, k3， beads 表中无直接映射
        type = 'custom';
      } else if (!isNaN(parseInt(item))) {
        beadId = parseInt(item);
        type = 'numeric';
      }
    } else if (typeof item === 'number' || !isNaN(parseInt(item))) {
      beadId = parseInt(item);
      type = 'numeric';
    }

    if (beadId !== null && beadId > 0) {
      const bead = beads.find(b => b.id == beadId);
      if (bead) {
        details.push({
          id: beadId,
          raw_id: code,
          name: bead.name,
          category: bead.category,
          color_family: bead.color_family,
          size: bead.size,
          price: bead.price,
          image: bead.image,
          color: bead.color || '#9E9E9E',
          type: bead.type || 'dynamic'
        });
        continue;
      }
    }

    // 找不到对应珠子时，返回编码占位信息，保证珠子数量正确
    details.push({
      id: null,
      raw_id: code,
      name: code,
      category: '未知',
      color_family: '',
      size: '',
      price: 0,
      image: '',
      color: '#9E9E9E',
      type: type
    });
  }
  return details;
}

// ========== 支付相关 ==========
async function getPayments() {
  return await query('SELECT * FROM payments ORDER BY id DESC');
}

async function savePayments(payments) {
  return true;
}

async function addPayment(payment) {
  const data = { ...payment };
  const fields = Object.keys(data).filter(k => !['id', 'created_at'].includes(k));
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => data[f]);
  const sql = `INSERT INTO payments (${fields.join(',')}) VALUES (${placeholders})`;
  const result = await query(sql, values);
  return result.insertId;
}

async function updatePayment(id, data) {
  const clean = { ...data };
  delete clean.id;
  delete clean.created_at;
  const fields = Object.keys(clean);
  if (fields.length === 0) return true;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => clean[f]);
  values.push(id);
  await query(`UPDATE payments SET ${setClause} WHERE id = ?`, values);
  return true;
}

module.exports = {
  FILES,
  read,
  write,
  getUsers, saveUsers, findUserByUsername, findUserById, findUserByOpenid, addUser, updateUser, deleteUser,
  getDesigns, saveDesigns, findDesignByCode, findDesignById, addDesign, updateDesign, deleteDesign,
  getOrders, saveOrders, addOrder, updateOrder, findOrderById, deleteOrder,
  getLikes, saveLikes, isLiked, toggleLike,
  getBeads, saveBeads, findBeadById, addBead, updateBead, deleteBead,
  getCarts, saveCarts, getCartByUserId, updateCart,
  getAddresses, saveAddresses, getAddressesByUserId, addAddress, updateAddress, deleteAddress, setDefaultAddress,
  parsePatternToBeadDetails,
  getPayments, savePayments, addPayment, updatePayment
};
