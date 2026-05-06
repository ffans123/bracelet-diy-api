/**
 * 管理后台兼容路由层
 * 将 admin.html 的 /backend/api/xxx/xxx.php 请求映射到 Express 后端功能
 * 响应格式保持与旧 PHP 后端一致：{ code: 200, message: '...', data: ... }
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

// ========== 辅助函数 ==========
function getTokenFromReq(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    const match = authHeader.match(/Bearer\s+(.+)$/i);
    if (match) return match[1];
  }
  if (req.body && req.body.token) return req.body.token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

const requireAdmin = asyncHandler(async (req, res, next) => {
  const token = getTokenFromReq(req);
  if (!token) return R.unauthorized(res, '请先登录');
  const payload = auth.verifyToken(token);
  if (!payload) return R.unauthorized(res, '登录已过期');
  const user = await db.findUserById(payload.user_id);
  if (!user) return R.unauthorized(res, '用户不存在');
  if (user.role !== 'admin') return R.forbidden(res, '无权访问');
  req.adminUser = user;
  next();
});

// ========== 登录与认证 ==========

// POST /backend/api/user/admin_login.php
router.post('/user/admin_login.php', asyncHandler(async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return R.error(res, '用户名和密码不能为空');
    }
    const user = await db.findUserByUsername(username.trim());
    if (!user) {
      return R.error(res, '用户名或密码错误');
    }
    // 检查管理员权限
    if (user.role !== 'admin') {
      return R.error(res, '无权访问，非管理员账号');
    }
    const hash = user.password.replace(/^\$2y\$/, '$2a$');
    if (!bcrypt.compareSync(password, hash)) {
      return R.error(res, '用户名或密码错误');
    }
    delete user.password;
    const token = auth.generateToken(user.id);
    R.success(res, { token, user }, '登录成功');
  } catch (e) {
    R.serverError(res, '登录失败：' + e.message);
  }
}));

// GET /backend/api/user/verify_token.php
router.get('/user/verify_token.php', asyncHandler(async (req, res) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) {
      return R.error(res, 'token不能为空', 401);
    }
    const payload = auth.verifyToken(token);
    if (!payload) {
      return R.error(res, 'token无效或已过期', 401);
    }
    const user = await db.findUserById(payload.user_id);
    if (!user) {
      return R.error(res, '用户不存在', 401);
    }
    delete user.password;
    R.success(res, { valid: true, user }, '验证成功');
  } catch (e) {
    R.serverError(res, '验证失败：' + e.message);
  }
}));

// POST /backend/api/user/change_password.php
router.post('/user/change_password.php', asyncHandler(async (req, res) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return R.unauthorized(res);
    const payload = auth.verifyToken(token);
    if (!payload) return R.unauthorized(res);
    const { old_password, new_password } = req.body;
    const u = await db.findUserById(payload.user_id);
    if (!u) return R.error(res, '用户不存在');
    const hash = u.password.replace(/^\$2y\$/, '$2a$');
    if (!bcrypt.compareSync(old_password, hash)) {
      return R.error(res, '原密码错误');
    }
    await db.updateUser(payload.user_id, { password: bcrypt.hashSync(new_password, 10) });
    R.success(res, null, '密码修改成功');
  } catch (e) {
    R.serverError(res, '修改失败：' + e.message);
  }
}));

// ========== 用户管理 ==========

// GET /backend/api/user/list.php
router.get('/user/list.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { keyword } = req.query;
    let users = await db.getUsers();
    if (keyword) {
      const kw = keyword.toLowerCase();
      users = users.filter(u =>
        (u.username && u.username.toLowerCase().includes(kw)) ||
        (u.nickname && u.nickname.toLowerCase().includes(kw)) ||
        (u.phone && u.phone.includes(kw))
      );
    }
    // 移除密码字段
    users = users.map(u => {
      const { password, ...rest } = u;
      return rest;
    });
    R.success(res, { list: users, total: users.length }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /backend/api/user/delete.php
router.post('/user/delete.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const user = await db.findUserById(id);
    if (!user) {
      return R.error(res, '用户不存在');
    }
    await db.deleteUser(id);
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
}));

// POST /backend/api/user/update.php
router.post('/user/update.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    if (!await db.updateUser(id, data)) {
      return R.error(res, '用户不存在');
    }
    R.success(res, null, '更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
}));

// POST /backend/api/user/recharge.php
router.post('/user/recharge.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { user_id, amount } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return R.error(res, '充值金额无效');
    }
    const u = await db.findUserById(user_id);
    if (!u) return R.error(res, '用户不存在');
    const before = parseFloat(u.balance || 0);
    const after = before + amt;
    await db.updateUser(user_id, { balance: after });
    R.success(res, { before_balance: before, after_balance: after }, '充值成功');
  } catch (e) {
    R.serverError(res, '充值失败：' + e.message);
  }
}));

// ========== 订单管理 ==========

// GET /backend/api/order/list.php
router.get('/order/list.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { status, page = 1, pageSize = 1000 } = req.query;
    let orders = await db.getOrders();
    if (status && status !== 'all') {
      orders = orders.filter(o => o.status === status);
    }
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = orders.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = orders.slice(offset, offset + parseInt(pageSize));

    // 关联用户信息和设计信息
    const users = await db.getUsers();
    const designs = await db.getDesigns();
    list.forEach(order => {
      const user = users.find(u => u.id == order.user_id);
      order.user = user ? { id: user.id, username: user.username, nickname: user.nickname } : null;
      const design = designs.find(d => d.id == order.design_id);
      if (design) {
        order.design_name = design.name;
        order.cover_image = design.cover_image || '';
      }
    });

    R.success(res, { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// GET /backend/api/order/detail.php
router.get('/order/detail.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.query;
    const order = await db.findOrderById(id);
    if (!order) return R.error(res, '订单不存在');
    const design = await db.findDesignById(order.design_id);
    if (design) {
      order.design_name = design.name;
      let pattern = design.pattern;
      if (typeof pattern === 'string') {
        try { pattern = JSON.parse(pattern); } catch { pattern = []; }
      }
      order.pattern = pattern;
      order.bead_details = await db.parsePatternToBeadDetails(pattern);
      order.cover_image = design.cover_image || '';
    }
    const user = await db.findUserById(order.user_id);
    if (user) {
      order.user = { id: user.id, username: user.username, nickname: user.nickname, phone: user.phone };
    }
    R.success(res, order, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /backend/api/order/ship.php
router.post('/order/ship.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { order_id, express_no, express_company } = req.body;
    const order = await db.findOrderById(order_id);
    if (!order) return R.error(res, '订单不存在');
    if (order.status !== 'paid') {
      return R.error(res, '只有已付款订单可以发货');
    }
    await db.updateOrder(order_id, {
      status: 'shipped',
      express_no: express_no || '',
      express_company: express_company || '',
      shipped_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    R.success(res, null, '发货成功');
  } catch (e) {
    R.serverError(res, '发货失败：' + e.message);
  }
}));

// POST /backend/api/order/update_status.php
router.post('/order/update_status.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { order_id, status } = req.body;
    const order = await db.findOrderById(order_id);
    if (!order) return R.error(res, '订单不存在');
    const validStatuses = ['pending', 'paid', 'shipped', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return R.error(res, '无效的状态');
    }
    await db.updateOrder(order_id, { status });
    R.success(res, null, '状态更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
}));

// POST /backend/api/order/delete.php
router.post('/order/delete.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    const order = await db.findOrderById(id);
    if (!order) {
      return R.error(res, '订单不存在');
    }
    await db.deleteOrder(id);
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
}));

// GET /backend/api/order/cleanup.php
router.get('/order/cleanup.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    // 清理超过30天的已取消/已完成订单
    const { query } = require('../utils/db');
    const result = await query(
      "DELETE FROM orders WHERE status IN ('cancelled', 'completed') AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    const removed = result.affectedRows || 0;
    R.success(res, { removed }, `清理完成，已删除 ${removed} 个过期订单`);
  } catch (e) {
    R.serverError(res, '清理失败：' + e.message);
  }
}));

// ========== 珠子管理 ==========

// GET /backend/api/bead/list.php
router.get('/bead/list.php', asyncHandler(async (req, res) => {
  try {
    const beads = await db.getBeads();
    R.success(res, beads, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /backend/api/bead/create.php
router.post('/bead/create.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const bead = req.body;
    const id = await db.addBead(bead);
    if (!id) return R.serverError(res, '创建失败');
    R.success(res, { id }, '创建成功');
  } catch (e) {
    R.serverError(res, '创建失败：' + e.message);
  }
}));

// POST /backend/api/bead/update.php
router.post('/bead/update.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    if (!await db.updateBead(id, data)) {
      return R.error(res, '珠子不存在');
    }
    R.success(res, null, '更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
}));

// POST /backend/api/bead/delete.php
router.post('/bead/delete.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    if (!await db.deleteBead(id)) {
      return R.error(res, '珠子不存在');
    }
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
}));

// ========== 七牛云 Token ==========

// GET /backend/api/get_qiniu_token.php
// ⚠️ 已废弃：图片上传已迁移到微信云托管对象存储，请使用 POST /upload/image
router.get('/get_qiniu_token.php', requireAdmin, asyncHandler(async (req, res) => {
  R.error(res, '七牛云上传已废弃。图片上传请使用 POST /upload/image 接口（FormData 格式，字段名 file）', 410);
}));

// ========== 灵感（广场）管理 ==========

// GET /backend/api/square/list.php - 获取所有设计（admin视角，包含未公开）
router.get('/square/list.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { keyword, isPublic, isFeatured, page = 1, pageSize = 50 } = req.query;
    let designs = await db.getDesigns();

    // 搜索
    if (keyword) {
      const kw = keyword.toLowerCase();
      designs = designs.filter(d =>
        (d.name && d.name.toLowerCase().includes(kw)) ||
        (d.design_code && d.design_code.toLowerCase().includes(kw))
      );
    }

    // 按公开状态筛选
    if (isPublic !== undefined && isPublic !== '') {
      const val = isPublic === '1' || isPublic === 'true';
      designs = designs.filter(d => !!d.is_public === val);
    }

    // 按精选状态筛选
    if (isFeatured !== undefined && isFeatured !== '') {
      const val = isFeatured === '1' || isFeatured === 'true';
      designs = designs.filter(d => !!d.is_featured === val);
    }

    // 排序：最新的在前
    designs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const total = designs.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = designs.slice(offset, offset + parseInt(pageSize));

    // 关联作者信息
    const users = await db.getUsers();
    list.forEach(d => {
      if (typeof d.pattern === 'string') {
        try { d.pattern = JSON.parse(d.pattern); } catch { d.pattern = []; }
      }
      const user = users.find(u => u.id == d.user_id);
      d.author_name = user ? (user.nickname || user.username) : '匿名';
      d.author_avatar = user ? (user.avatar || '') : '';
    });

    R.success(res, { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// GET /backend/api/square/detail.php - 获取设计详情
router.get('/square/detail.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return R.error(res, 'ID不能为空');
    const design = await db.findDesignById(id);
    if (!design) return R.error(res, '设计不存在');
    if (typeof design.pattern === 'string') {
      try { design.pattern = JSON.parse(design.pattern); } catch { design.pattern = []; }
    }
    const user = await db.findUserById(design.user_id);
    design.author_name = user ? (user.nickname || user.username) : '匿名';
    design.author_avatar = user ? (user.avatar || '') : '';
    R.success(res, design, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /backend/api/square/update.php - 更新设计信息
router.post('/square/update.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id, name, price, is_featured } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const design = await db.findDesignById(id);
    if (!design) return R.error(res, '设计不存在');

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = parseFloat(price) || 0;
    if (is_featured !== undefined) updateData.is_featured = is_featured ? 1 : 0;
    updateData.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (!await db.updateDesign(id, updateData)) {
      return R.error(res, '更新失败');
    }
    R.success(res, null, '更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
}));

// POST /backend/api/square/toggle_public.php - 切换公开状态（审核/发布）
router.post('/square/toggle_public.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const design = await db.findDesignById(id);
    if (!design) return R.error(res, '设计不存在');

    const newPublic = design.is_public ? 0 : 1;
    await db.updateDesign(id, {
      is_public: newPublic,
      updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    R.success(res, { is_public: newPublic }, newPublic ? '已发布到广场' : '已下架');
  } catch (e) {
    R.serverError(res, '操作失败：' + e.message);
  }
}));

// POST /backend/api/square/toggle_featured.php - 切换精选状态
router.post('/square/toggle_featured.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const design = await db.findDesignById(id);
    if (!design) return R.error(res, '设计不存在');

    const newFeatured = design.is_featured ? 0 : 1;
    await db.updateDesign(id, {
      is_featured: newFeatured,
      updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    R.success(res, { is_featured: newFeatured }, newFeatured ? '已设为精选' : '已取消精选');
  } catch (e) {
    R.serverError(res, '操作失败：' + e.message);
  }
}));

// POST /backend/api/square/delete.php - 删除设计
router.post('/square/delete.php', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    if (!await db.deleteDesign(id)) {
      return R.error(res, '设计不存在');
    }
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
}));

module.exports = router;
