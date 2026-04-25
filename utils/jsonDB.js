/**
 * JSON 数据库操作类（替代 PHP JsonDB）
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 文件路径常量
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

// 初始化所有数据文件
Object.values(FILES).forEach(file => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '[]', 'utf-8');
  }
});

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

// ========== 用户相关 ==========
function getUsers() { return read(FILES.USERS); }
function saveUsers(users) { return write(FILES.USERS, users); }

function findUserByUsername(username) {
  const users = getUsers();
  return users.find(u => u.username === username) || null;
}

function findUserById(id) {
  const users = getUsers();
  const user = users.find(u => u.id == id);
  if (user) {
    if (!user.balance) user.balance = 0;
    if (!user.role) user.role = 'user';
  }
  return user || null;
}

function findUserByOpenid(openid) {
  const users = getUsers();
  return users.find(u => u.openid === openid) || null;
}

function addUser(user) {
  const users = getUsers();
  user.id = users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1;
  user.balance = 0;
  user.role = user.role || 'user';
  user.created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  users.push(user);
  return saveUsers(users) ? user.id : false;
}

function updateUser(id, data) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id == id);
  if (idx === -1) return false;
  Object.keys(data).forEach(key => {
    if (key !== 'id' && key !== 'created_at') {
      users[idx][key] = data[key];
    }
  });
  users[idx].updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return saveUsers(users);
}

// ========== 设计相关 ==========
function getDesigns() { return read(FILES.DESIGNS); }
function saveDesigns(designs) { return write(FILES.DESIGNS, designs); }

function findDesignByCode(code) {
  return getDesigns().find(d => d.design_code === code) || null;
}

function findDesignById(id) {
  return getDesigns().find(d => d.id == id) || null;
}

function addDesign(design) {
  const designs = getDesigns();
  design.id = designs.length > 0 ? Math.max(...designs.map(d => d.id || 0)) + 1 : 1;
  design.created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  designs.push(design);
  return saveDesigns(designs) ? design.id : false;
}

function updateDesign(id, data) {
  const designs = getDesigns();
  const idx = designs.findIndex(d => d.id == id);
  if (idx === -1) return false;
  Object.keys(data).forEach(key => {
    if (key !== 'id' && key !== 'created_at') {
      designs[idx][key] = data[key];
    }
  });
  designs[idx].updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return saveDesigns(designs);
}

function deleteDesign(id) {
  const designs = getDesigns();
  const filtered = designs.filter(d => d.id != id);
  if (filtered.length === designs.length) return false;
  return saveDesigns(filtered);
}

// ========== 订单相关 ==========
function getOrders() { return read(FILES.ORDERS); }
function saveOrders(orders) { return write(FILES.ORDERS, orders); }

function addOrder(order) {
  const orders = getOrders();
  const maxId = orders.length > 0 ? Math.max(...orders.map(o => o.id || 0)) : 0;
  order.id = maxId + 1;
  order.created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  orders.push(order);
  return saveOrders(orders) ? order.id : false;
}

function updateOrder(id, data) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id == id);
  if (idx === -1) return false;
  Object.keys(data).forEach(key => {
    if (key !== 'id' && key !== 'created_at') {
      orders[idx][key] = data[key];
    }
  });
  orders[idx].updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return saveOrders(orders);
}

function findOrderById(id) {
  return getOrders().find(o => o.id == id) || null;
}

// ========== 点赞相关 ==========
function getLikes() { return read(FILES.LIKES); }
function saveLikes(likes) { return write(FILES.LIKES, likes); }

function isLiked(userId, designId) {
  return getLikes().find(l => l.user_id == userId && l.design_id == designId) || null;
}

function toggleLike(userId, designId) {
  const likes = getLikes();
  const idx = likes.findIndex(l => l.user_id == userId && l.design_id == designId);
  if (idx !== -1) {
    // 取消点赞
    likes.splice(idx, 1);
    saveLikes(likes);
    const design = findDesignById(designId);
    if (design) {
      updateDesign(designId, { like_count: Math.max(0, (design.like_count || 0) - 1) });
    }
    return false;
  } else {
    // 添加点赞
    likes.push({
      id: likes.length > 0 ? Math.max(...likes.map(l => l.id || 0)) + 1 : 1,
      user_id: userId,
      design_id: designId,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    saveLikes(likes);
    const design = findDesignById(designId);
    if (design) {
      updateDesign(designId, { like_count: (design.like_count || 0) + 1 });
    }
    return true;
  }
}

// ========== 珠子相关 ==========
function getBeads() { return read(FILES.BEADS); }
function saveBeads(beads) { return write(FILES.BEADS, beads); }

function findBeadById(id) {
  return getBeads().find(b => b.id == id) || null;
}

function addBead(bead) {
  const beads = getBeads();
  const maxId = beads.length > 0 ? Math.max(...beads.map(b => b.id || 0)) : 0;
  bead.id = maxId + 1;
  bead.created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  bead.updated_at = bead.created_at;
  beads.push(bead);
  return saveBeads(beads) ? bead.id : false;
}

function updateBead(id, data) {
  const beads = getBeads();
  const idx = beads.findIndex(b => b.id == id);
  if (idx === -1) return false;
  Object.keys(data).forEach(key => {
    if (key !== 'id' && key !== 'created_at') {
      beads[idx][key] = data[key];
    }
  });
  beads[idx].updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return saveBeads(beads);
}

function deleteBead(id) {
  const beads = getBeads();
  const filtered = beads.filter(b => b.id != id);
  if (filtered.length === beads.length) return false;
  return saveBeads(filtered);
}

// ========== 购物车相关 ==========
function getCarts() { return read(FILES.CARTS); }
function saveCarts(carts) { return write(FILES.CARTS, carts); }

function getCartByUserId(userId) {
  return getCarts().find(c => c.user_id == userId) || null;
}

function updateCart(cart) {
  const carts = getCarts();
  const idx = carts.findIndex(c => c.user_id == cart.user_id);
  if (idx !== -1) {
    carts[idx] = cart;
  } else {
    carts.push(cart);
  }
  return saveCarts(carts);
}

// ========== 地址相关 ==========
function getAddresses() { return read(FILES.ADDRESSES); }
function saveAddresses(addresses) { return write(FILES.ADDRESSES, addresses); }

function getAddressesByUserId(userId) {
  return getAddresses().filter(a => a.user_id == userId);
}

function addAddress(address) {
  const addresses = getAddresses();
  // 兼容 PHP 后端的字符串 ID 格式
  address.id = address.id || ('addr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5));
  address.created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  addresses.push(address);
  return saveAddresses(addresses) ? address.id : false;
}

function updateAddress(id, data) {
  const addresses = getAddresses();
  const idx = addresses.findIndex(a => a.id == id);
  if (idx === -1) return false;
  Object.keys(data).forEach(key => {
    if (key !== 'id' && key !== 'created_at') {
      addresses[idx][key] = data[key];
    }
  });
  addresses[idx].updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return saveAddresses(addresses);
}

function deleteAddress(id) {
  const addresses = getAddresses();
  const filtered = addresses.filter(a => a.id != id);
  if (filtered.length === addresses.length) return false;
  return saveAddresses(filtered);
}

function setDefaultAddress(userId, addressId) {
  const addresses = getAddresses();
  addresses.forEach(a => {
    if (a.user_id == userId) {
      a.is_default = (a.id == addressId) ? 1 : 0;
    }
  });
  return saveAddresses(addresses);
}

// ========== 解析 pattern 为珠子详情 ==========
function parsePatternToBeadDetails(pattern) {
  const beads = getBeads();
  const details = [];
  if (!Array.isArray(pattern)) return details;

  for (const item of pattern) {
    let beadId = null;
    let type = 'unknown';

    if (typeof item === 'object' && item !== null && item.mat !== undefined) {
      beadId = parseInt(item.mat);
      type = 'sandbox';
    } else if (typeof item === 'string') {
      const dynamicMatch = item.match(/^dynamic_(\d+)$/);
      const presetMatch = item.match(/^[a-z]+_(\d+)$/);
      if (dynamicMatch) {
        beadId = parseInt(dynamicMatch[1]);
        type = 'dynamic';
      } else if (presetMatch) {
        beadId = parseInt(presetMatch[1]);
        type = 'preset';
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
          raw_id: typeof item === 'string' ? item : String(beadId),
          name: bead.name,
          category: bead.category,
          color_family: bead.color_family,
          size: bead.size,
          price: bead.price,
          image: bead.image,
          color: bead.color || '#9E9E9E',
          type: bead.type || 'dynamic'
        });
      }
    }
  }
  return details;
}

// ========== 支付相关 ==========
function getPayments() { return read(FILES.PAYMENTS); }
function savePayments(payments) { return write(FILES.PAYMENTS, payments); }

function addPayment(payment) {
  const payments = getPayments();
  payment.id = payments.length > 0 ? Math.max(...payments.map(p => p.id || 0)) + 1 : 1;
  payment.created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  payments.push(payment);
  return savePayments(payments) ? payment.id : false;
}

module.exports = {
  FILES,
  read,
  write,
  getUsers, saveUsers, findUserByUsername, findUserById, findUserByOpenid, addUser, updateUser,
  getDesigns, saveDesigns, findDesignByCode, findDesignById, addDesign, updateDesign, deleteDesign,
  getOrders, saveOrders, addOrder, updateOrder, findOrderById,
  getLikes, saveLikes, isLiked, toggleLike,
  getBeads, saveBeads, findBeadById, addBead, updateBead, deleteBead,
  getCarts, saveCarts, getCartByUserId, updateCart,
  getAddresses, saveAddresses, getAddressesByUserId, addAddress, updateAddress, deleteAddress, setDefaultAddress,
  parsePatternToBeadDetails,
  getPayments, savePayments, addPayment
};
